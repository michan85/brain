"""
Product and inventory models for the ecommerce application.

Product catalog with categories, variants, and inventory tracking.
Stock decrements happen inside ACID transactions with order creation.
"""

from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


class Category(models.Model):
    """Hierarchical product categories."""

    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=200, unique=True)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    description = models.TextField(blank=True, default="")
    image_url = models.URLField(blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "categories"
        indexes = [
            models.Index(fields=["parent", "sort_order"]),
            models.Index(fields=["slug"]),
        ]

    def __str__(self):
        return self.name


class Product(models.Model):
    """
    Core product model. Stock is managed transactionally in order processing.
    Referenced by OrderItem, Review, WishlistItem, CartItem, and UserActivity.
    """

    name = models.CharField(max_length=500)
    slug = models.SlugField(max_length=500, unique=True)
    sku = models.CharField(max_length=50, unique=True, db_index=True)
    description = models.TextField()
    short_description = models.CharField(max_length=500, blank=True, default="")

    price = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    compare_at_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    cost_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Cost of goods, used in margin reports"
    )

    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )

    stock_quantity = models.IntegerField(
        default=0,
        help_text="Current inventory level. Decremented atomically during order creation."
    )
    low_stock_threshold = models.PositiveIntegerField(default=10)
    weight_grams = models.PositiveIntegerField(null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False)
    is_digital = models.BooleanField(default=False)

    tags = models.ManyToManyField("Tag", blank=True, related_name="products")
    brand = models.ForeignKey(
        "Brand", on_delete=models.SET_NULL, null=True, blank=True, related_name="products"
    )

    avg_rating = models.DecimalField(
        max_digits=3, decimal_places=2, default=Decimal("0.00"),
        help_text="Denormalized average rating, updated via trigger"
    )
    review_count = models.PositiveIntegerField(default=0)
    total_sold = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["category", "is_active"]),
            models.Index(fields=["price"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["is_active", "is_featured"]),
            models.Index(fields=["stock_quantity"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    @property
    def is_low_stock(self):
        return self.stock_quantity <= self.low_stock_threshold

    @property
    def is_out_of_stock(self):
        return self.stock_quantity <= 0


class ProductVariant(models.Model):
    """Size/color/material variants of a product."""

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    name = models.CharField(max_length=200)
    sku_suffix = models.CharField(max_length=20)
    price_adjustment = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal("0.00")
    )
    stock_quantity = models.IntegerField(default=0)
    attributes = models.JSONField(default=dict, help_text='e.g. {"size": "XL", "color": "blue"}')
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("product", "sku_suffix")]


class ProductImage(models.Model):
    """Images for products."""

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="images"
    )
    url = models.URLField()
    alt_text = models.CharField(max_length=300, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)
    is_primary = models.BooleanField(default=False)


class Brand(models.Model):
    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(max_length=200, unique=True)
    logo_url = models.URLField(blank=True, default="")
    website = models.URLField(blank=True, default="")


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)


class WishlistItem(models.Model):
    """User wishlists, FK to both User and Product."""

    user = models.ForeignKey(
        "user.User", on_delete=models.CASCADE, related_name="wishlist_items"
    )
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="wishlist_items"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "product")]


class InventoryLog(models.Model):
    """
    Audit log for inventory changes. Every stock mutation is recorded here.
    Used in inventory reconciliation reports.
    """

    class ChangeType(models.TextChoices):
        ORDER = "order", "Order Placed"
        CANCEL = "cancel", "Order Cancelled"
        RESTOCK = "restock", "Restocked"
        ADJUSTMENT = "adjustment", "Manual Adjustment"
        RETURN = "return", "Return"

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="inventory_logs"
    )
    change_type = models.CharField(max_length=20, choices=ChangeType.choices)
    quantity_change = models.IntegerField()
    quantity_after = models.IntegerField()
    reference_id = models.CharField(
        max_length=100, blank=True, default="",
        help_text="Order ID or other reference"
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    created_by = models.ForeignKey(
        "user.User", on_delete=models.SET_NULL, null=True, blank=True
    )

    class Meta:
        indexes = [
            models.Index(fields=["product", "created_at"]),
            models.Index(fields=["change_type", "created_at"]),
        ]
