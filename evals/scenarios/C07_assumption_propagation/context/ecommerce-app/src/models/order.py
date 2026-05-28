"""
Order models for the ecommerce application.

Order processing uses multi-table ACID transactions to ensure consistency
between orders, order items, inventory decrements, and payment records.
"""

from django.db import models, transaction
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal

from .user import User
from .product import Product


class Order(models.Model):
    """
    Core order model. Created within an ACID transaction that also:
    - Creates OrderItem records
    - Decrements Product.stock_quantity
    - Creates a PaymentRecord
    - Updates UserProfile.total_spent
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        PROCESSING = "processing", "Processing"
        SHIPPED = "shipped", "Shipped"
        DELIVERED = "delivered", "Delivered"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="orders", db_index=True
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    shipping_address = models.ForeignKey(
        "ShippingAddress", on_delete=models.PROTECT, related_name="orders"
    )
    subtotal = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    tax_amount = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    shipping_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    total = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    notes = models.TextField(blank=True, default="")
    tracking_number = models.CharField(max_length=100, blank=True, default="")
    estimated_delivery = models.DateField(null=True, blank=True)
    coupon = models.ForeignKey(
        "Coupon", on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "status"]),
            models.Index(fields=["created_at", "status"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        return f"Order #{self.pk} - {self.user.email} - {self.status}"


class OrderItem(models.Model):
    """Individual line items within an order."""

    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="items", db_index=True
    )
    product = models.ForeignKey(
        Product, on_delete=models.PROTECT, related_name="order_items"
    )
    variant = models.ForeignKey(
        "ProductVariant", on_delete=models.PROTECT, null=True, blank=True
    )
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    product_snapshot = models.JSONField(
        help_text="Snapshot of product data at time of purchase"
    )

    class Meta:
        unique_together = [("order", "product", "variant")]

    def __str__(self):
        return f"OrderItem: {self.quantity}x {self.product.name} in Order #{self.order_id}"


class PaymentRecord(models.Model):
    """Payment records tied to orders via FK."""

    class Method(models.TextChoices):
        CREDIT_CARD = "credit_card", "Credit Card"
        DEBIT_CARD = "debit_card", "Debit Card"
        PAYPAL = "paypal", "PayPal"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        AUTHORIZED = "authorized", "Authorized"
        CAPTURED = "captured", "Captured"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    order = models.ForeignKey(
        Order, on_delete=models.PROTECT, related_name="payments"
    )
    method = models.CharField(max_length=20, choices=Method.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    gateway_transaction_id = models.CharField(max_length=255, unique=True)
    gateway_response = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["order", "status"]),
        ]


class ShippingAddress(models.Model):
    """Shipping addresses linked to users."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="shipping_addresses")
    full_name = models.CharField(max_length=255)
    street_address = models.CharField(max_length=500)
    city = models.CharField(max_length=100)
    state = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20)
    country = models.CharField(max_length=2, default="US")
    phone = models.CharField(max_length=20, blank=True, default="")
    is_default = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["user", "is_default"]),
        ]


class Coupon(models.Model):
    """Discount coupons referenced by orders."""

    code = models.CharField(max_length=50, unique=True)
    discount_percent = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    discount_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    min_order_amount = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    max_uses = models.PositiveIntegerField(default=0)
    times_used = models.PositiveIntegerField(default=0)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    is_active = models.BooleanField(default=True)


# ---------------------------------------------------------------------------
# Transaction-heavy order processing
# ---------------------------------------------------------------------------

def create_order(user, cart_items, shipping_address_id, payment_info, coupon_code=None):
    """
    Create an order within a single ACID transaction.

    This function performs ALL of the following atomically:
    1. Validates and locks inventory rows (SELECT FOR UPDATE)
    2. Creates the Order record
    3. Creates OrderItem records for each cart item
    4. Decrements Product.stock_quantity for each item
    5. Creates a PaymentRecord
    6. Updates UserProfile.total_spent
    7. Applies coupon if provided

    If ANY step fails, the entire transaction rolls back.
    """
    with transaction.atomic():
        # Lock inventory rows to prevent overselling
        product_ids = [item["product_id"] for item in cart_items]
        products = dict(
            Product.objects.select_for_update()
            .filter(id__in=product_ids)
            .values_list("id", flat=False)
            .in_bulk()
        )

        # Validate stock
        for item in cart_items:
            product = products[item["product_id"]]
            if product.stock_quantity < item["quantity"]:
                raise ValueError(
                    f"Insufficient stock for {product.name}: "
                    f"requested {item['quantity']}, available {product.stock_quantity}"
                )

        # Calculate totals
        subtotal = sum(
            products[i["product_id"]].price * i["quantity"] for i in cart_items
        )

        # Apply coupon
        discount = Decimal("0.00")
        coupon = None
        if coupon_code:
            coupon = Coupon.objects.select_for_update().get(
                code=coupon_code, is_active=True
            )
            if coupon.discount_percent:
                discount = subtotal * (coupon.discount_percent / 100)
            elif coupon.discount_amount:
                discount = min(coupon.discount_amount, subtotal)
            coupon.times_used += 1
            coupon.save()

        tax = (subtotal - discount) * Decimal("0.08")  # 8% tax
        total = subtotal - discount + tax

        # Create order
        order = Order.objects.create(
            user=user,
            shipping_address_id=shipping_address_id,
            subtotal=subtotal,
            tax_amount=tax,
            discount_amount=discount,
            total=total,
            coupon=coupon,
            status=Order.Status.CONFIRMED,
        )

        # Create items and decrement inventory
        for item in cart_items:
            product = products[item["product_id"]]
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=item["quantity"],
                unit_price=product.price,
                total_price=product.price * item["quantity"],
                product_snapshot={
                    "name": product.name,
                    "sku": product.sku,
                    "price": str(product.price),
                },
            )
            product.stock_quantity -= item["quantity"]
            product.save()

        # Create payment record
        PaymentRecord.objects.create(
            order=order,
            method=payment_info["method"],
            amount=total,
            gateway_transaction_id=payment_info["transaction_id"],
            gateway_response=payment_info.get("gateway_response", {}),
            status=PaymentRecord.Status.CAPTURED,
        )

        # Update user profile aggregates
        user.profile.total_spent += total
        user.profile.order_count += 1
        user.profile.save()

        return order


def cancel_order(order_id):
    """
    Cancel an order, restoring inventory. Also runs in an ACID transaction.
    """
    with transaction.atomic():
        order = Order.objects.select_for_update().get(id=order_id)
        if order.status in (Order.Status.SHIPPED, Order.Status.DELIVERED):
            raise ValueError("Cannot cancel shipped/delivered orders")

        # Restore inventory
        for item in order.items.select_related("product").all():
            product = Product.objects.select_for_update().get(id=item.product_id)
            product.stock_quantity += item.quantity
            product.save()

        # Refund payment
        for payment in order.payments.filter(status=PaymentRecord.Status.CAPTURED):
            payment.status = PaymentRecord.Status.REFUNDED
            payment.save()

        # Restore user aggregates
        order.user.profile.total_spent -= order.total
        order.user.profile.order_count -= 1
        order.user.profile.save()

        order.status = Order.Status.CANCELLED
        order.save()

        return order
