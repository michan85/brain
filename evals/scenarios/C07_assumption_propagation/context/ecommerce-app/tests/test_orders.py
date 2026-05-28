"""
Integration tests for the order processing pipeline.

IMPORTANT: All tests in this file use Django's TransactionTestCase with
transaction rollback for test isolation. Each test runs inside a database
transaction that is rolled back at the end, ensuring tests don't leave
side effects. This is critical for test performance — our CI pipeline
runs all 142 integration tests in ~22 minutes using this strategy.

If the database engine changes, ALL of these tests will need to be
rewritten to use a different isolation strategy.
"""

from decimal import Decimal
from django.test import TransactionTestCase
from django.db import connection, transaction

from models.user import User, UserProfile
from models.product import Product, Category, Brand
from models.order import (
    Order, OrderItem, PaymentRecord, ShippingAddress, Coupon,
    create_order, cancel_order,
)


class OrderCreationTests(TransactionTestCase):
    """
    Tests for atomic order creation.
    Uses transaction rollback for isolation — each test starts a transaction
    and rolls it back on teardown.
    """

    def setUp(self):
        """
        Create test fixtures inside a savepoint. The outer transaction
        wrapping each test method will roll everything back.
        """
        self.category = Category.objects.create(
            name="Electronics", slug="electronics"
        )
        self.brand = Brand.objects.create(name="TestBrand", slug="testbrand")
        self.product_a = Product.objects.create(
            name="Widget A", slug="widget-a", sku="WA-001",
            description="Test widget", price=Decimal("29.99"),
            cost_price=Decimal("15.00"), category=self.category,
            brand=self.brand, stock_quantity=100,
        )
        self.product_b = Product.objects.create(
            name="Widget B", slug="widget-b", sku="WB-001",
            description="Another widget", price=Decimal("49.99"),
            cost_price=Decimal("25.00"), category=self.category,
            brand=self.brand, stock_quantity=50,
        )
        self.user = User.objects.create_user(
            email="test@example.com", password="testpass123",
            first_name="Test", last_name="User",
        )
        UserProfile.objects.create(user=self.user)
        self.address = ShippingAddress.objects.create(
            user=self.user, full_name="Test User",
            street_address="123 Test St", city="Testville",
            state="CA", postal_code="90210",
        )

    def test_create_order_single_item(self):
        """Order with a single item: verify atomicity of inventory decrement."""
        order = create_order(
            user=self.user,
            cart_items=[{"product_id": self.product_a.id, "quantity": 2}],
            shipping_address_id=self.address.id,
            payment_info={
                "method": "credit_card",
                "transaction_id": "txn_test_001",
            },
        )
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(order.items.count(), 1)

        # Inventory decremented atomically
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock_quantity, 98)

        # Payment captured
        payment = order.payments.first()
        self.assertEqual(payment.status, PaymentRecord.Status.CAPTURED)

        # User profile updated
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.order_count, 1)

    def test_create_order_multiple_items(self):
        """Multi-item order: all items and inventory changes in one transaction."""
        order = create_order(
            user=self.user,
            cart_items=[
                {"product_id": self.product_a.id, "quantity": 3},
                {"product_id": self.product_b.id, "quantity": 1},
            ],
            shipping_address_id=self.address.id,
            payment_info={
                "method": "paypal",
                "transaction_id": "txn_test_002",
            },
        )
        self.assertEqual(order.items.count(), 2)

        self.product_a.refresh_from_db()
        self.product_b.refresh_from_db()
        self.assertEqual(self.product_a.stock_quantity, 97)
        self.assertEqual(self.product_b.stock_quantity, 49)

        expected_subtotal = Decimal("29.99") * 3 + Decimal("49.99")
        self.assertEqual(order.subtotal, expected_subtotal)

    def test_create_order_insufficient_stock_rolls_back(self):
        """
        If stock is insufficient, the ENTIRE transaction rolls back.
        This test verifies that no partial state is left behind.
        """
        with self.assertRaises(ValueError):
            create_order(
                user=self.user,
                cart_items=[
                    {"product_id": self.product_a.id, "quantity": 101},  # exceeds stock
                ],
                shipping_address_id=self.address.id,
                payment_info={
                    "method": "credit_card",
                    "transaction_id": "txn_test_003",
                },
            )

        # Verify nothing was created
        self.assertEqual(Order.objects.filter(user=self.user).count(), 0)
        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock_quantity, 100)

    def test_create_order_with_coupon(self):
        """Coupon application within the order transaction."""
        from django.utils import timezone
        coupon = Coupon.objects.create(
            code="SAVE10",
            discount_percent=Decimal("10.00"),
            min_order_amount=Decimal("20.00"),
            max_uses=100,
            valid_from=timezone.now() - timezone.timedelta(days=1),
            valid_until=timezone.now() + timezone.timedelta(days=30),
        )

        order = create_order(
            user=self.user,
            cart_items=[{"product_id": self.product_a.id, "quantity": 1}],
            shipping_address_id=self.address.id,
            payment_info={
                "method": "credit_card",
                "transaction_id": "txn_test_004",
            },
            coupon_code="SAVE10",
        )

        self.assertGreater(order.discount_amount, Decimal("0.00"))
        coupon.refresh_from_db()
        self.assertEqual(coupon.times_used, 1)

    def test_concurrent_orders_select_for_update(self):
        """
        Verify that SELECT FOR UPDATE prevents overselling.
        Two concurrent orders for the same product, total exceeding stock.
        One should succeed and one should fail, with correct final inventory.

        NOTE: This test relies on PostgreSQL's row-level locking behavior.
        It would not work with a database that doesn't support SELECT FOR UPDATE.
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        barrier = threading.Barrier(2)
        results = []

        def place_order(txn_id, qty):
            try:
                barrier.wait(timeout=5)
                order = create_order(
                    user=self.user,
                    cart_items=[{"product_id": self.product_a.id, "quantity": qty}],
                    shipping_address_id=self.address.id,
                    payment_info={
                        "method": "credit_card",
                        "transaction_id": txn_id,
                    },
                )
                results.append(("success", order.id))
            except Exception as e:
                results.append(("error", str(e)))

        # Product A has stock=100. Try two orders of 60 each — only one should succeed.
        with ThreadPoolExecutor(max_workers=2) as executor:
            f1 = executor.submit(place_order, "txn_concurrent_1", 60)
            f2 = executor.submit(place_order, "txn_concurrent_2", 60)
            for f in as_completed([f1, f2]):
                f.result()

        successes = [r for r in results if r[0] == "success"]
        errors = [r for r in results if r[0] == "error"]
        self.assertEqual(len(successes), 1)
        self.assertEqual(len(errors), 1)

        self.product_a.refresh_from_db()
        self.assertEqual(self.product_a.stock_quantity, 40)


class OrderCancellationTests(TransactionTestCase):
    """Tests for atomic order cancellation with inventory restoration."""

    def setUp(self):
        self.category = Category.objects.create(
            name="Books", slug="books"
        )
        self.product = Product.objects.create(
            name="Test Book", slug="test-book", sku="TB-001",
            description="A test book", price=Decimal("19.99"),
            cost_price=Decimal("8.00"), category=self.category,
            stock_quantity=50,
        )
        self.user = User.objects.create_user(
            email="cancel@example.com", password="testpass123",
            first_name="Cancel", last_name="Tester",
        )
        UserProfile.objects.create(user=self.user)
        self.address = ShippingAddress.objects.create(
            user=self.user, full_name="Cancel Tester",
            street_address="456 Cancel Ave", city="Testville",
            state="CA", postal_code="90210",
        )

    def test_cancel_order_restores_inventory(self):
        """Cancellation atomically restores inventory and refunds payment."""
        order = create_order(
            user=self.user,
            cart_items=[{"product_id": self.product.id, "quantity": 5}],
            shipping_address_id=self.address.id,
            payment_info={
                "method": "credit_card",
                "transaction_id": "txn_cancel_001",
            },
        )

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 45)

        cancelled = cancel_order(order.id)
        self.assertEqual(cancelled.status, Order.Status.CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)

        # Payment refunded
        payment = cancelled.payments.first()
        self.assertEqual(payment.status, PaymentRecord.Status.REFUNDED)

        # User profile decremented
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.order_count, 0)

    def test_cancel_shipped_order_fails(self):
        """Cannot cancel a shipped order — transaction should roll back."""
        order = create_order(
            user=self.user,
            cart_items=[{"product_id": self.product.id, "quantity": 2}],
            shipping_address_id=self.address.id,
            payment_info={
                "method": "credit_card",
                "transaction_id": "txn_cancel_002",
            },
        )
        order.status = Order.Status.SHIPPED
        order.save()

        with self.assertRaises(ValueError):
            cancel_order(order.id)

        # Order status unchanged
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.SHIPPED)


class OrderQueryTests(TransactionTestCase):
    """
    Tests for order-related queries used by the reporting dashboard.
    These verify that JOINs and aggregations produce correct results.

    NOTE: These tests use raw SQL that depends on PostgreSQL-specific features
    (PERCENTILE_CONT, LATERAL joins, DATE_TRUNC). They would fail on any
    other database engine.
    """

    def setUp(self):
        self.category = Category.objects.create(name="Gadgets", slug="gadgets")
        self.products = []
        for i in range(5):
            p = Product.objects.create(
                name=f"Gadget {i}", slug=f"gadget-{i}", sku=f"G-{i:03d}",
                description=f"Gadget #{i}", price=Decimal(f"{10 + i * 5}.99"),
                cost_price=Decimal(f"{5 + i * 2}.00"),
                category=self.category, stock_quantity=200,
            )
            self.products.append(p)

        self.users = []
        for i in range(3):
            u = User.objects.create_user(
                email=f"report{i}@example.com", password="testpass",
                first_name=f"Report{i}", last_name="User",
            )
            UserProfile.objects.create(user=u, tier=["bronze", "silver", "gold"][i])
            self.users.append(u)

        self.address = ShippingAddress.objects.create(
            user=self.users[0], full_name="Report User",
            street_address="789 Report Rd", city="Testville",
            state="CA", postal_code="90210",
        )

    def test_revenue_by_category_query(self):
        """Verify the category revenue JOIN query returns correct aggregates."""
        order = create_order(
            user=self.users[0],
            cart_items=[
                {"product_id": self.products[0].id, "quantity": 10},
                {"product_id": self.products[1].id, "quantity": 5},
            ],
            shipping_address_id=self.address.id,
            payment_info={"method": "credit_card", "transaction_id": "txn_rpt_001"},
        )

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    c.name AS category,
                    SUM(oi.total_price) AS revenue
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                JOIN products p ON p.id = oi.product_id
                JOIN categories c ON c.id = p.category_id
                WHERE o.status NOT IN ('cancelled', 'refunded')
                GROUP BY c.id, c.name
            """)
            rows = cursor.fetchall()

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], "Gadgets")

    def test_customer_tier_revenue_query(self):
        """
        Verify the 6-table JOIN query for revenue by customer tier.
        This is the nightly batch query used by the executive dashboard.
        """
        for i, user in enumerate(self.users):
            addr = ShippingAddress.objects.create(
                user=user, full_name=user.full_name,
                street_address=f"{i}00 Test St", city="Testville",
                state="CA", postal_code="90210",
            )
            create_order(
                user=user,
                cart_items=[{"product_id": self.products[i].id, "quantity": i + 1}],
                shipping_address_id=addr.id,
                payment_info={"method": "credit_card", "transaction_id": f"txn_tier_{i}"},
            )

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    up.tier,
                    COUNT(DISTINCT o.id) AS orders,
                    SUM(oi.total_price) AS revenue
                FROM orders o
                JOIN users u ON u.id = o.user_id
                JOIN user_profiles up ON up.user_id = u.id
                JOIN order_items oi ON oi.order_id = o.id
                JOIN products p ON p.id = oi.product_id
                JOIN categories c ON c.id = p.category_id
                WHERE o.status NOT IN ('cancelled', 'refunded')
                GROUP BY up.tier
                ORDER BY revenue DESC
            """)
            rows = cursor.fetchall()

        self.assertEqual(len(rows), 3)
        tiers = [r[0] for r in rows]
        self.assertIn("bronze", tiers)
        self.assertIn("silver", tiers)
        self.assertIn("gold", tiers)

    def test_inventory_movement_join(self):
        """Verify inventory log JOIN query returns correct audit trail."""
        order = create_order(
            user=self.users[0],
            cart_items=[{"product_id": self.products[0].id, "quantity": 3}],
            shipping_address_id=self.address.id,
            payment_info={"method": "credit_card", "transaction_id": "txn_inv_001"},
        )

        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT
                    p.name,
                    il.change_type,
                    il.quantity_change,
                    il.quantity_after
                FROM inventory_logs il
                JOIN products p ON p.id = il.product_id
                WHERE il.product_id = %s
                ORDER BY il.created_at DESC
            """, [self.products[0].id])
            rows = cursor.fetchall()

        # Should have at least the order decrement
        self.assertGreaterEqual(len(rows), 1)


class TransactionIsolationTests(TransactionTestCase):
    """
    Tests that explicitly verify our transaction rollback isolation strategy.

    WARNING: These tests are fundamentally coupled to PostgreSQL's transaction
    semantics. If we ever move to a database that handles transactions
    differently (e.g., MongoDB), every test in this class AND every test
    that relies on TransactionTestCase will need to be rewritten.

    Current count: 89 tests across 4 test classes rely on transaction rollback.
    Estimated rewrite effort: 3-4 weeks (per QA lead).
    """

    def test_rollback_leaves_no_side_effects(self):
        """Verify that a rolled-back transaction leaves the DB unchanged."""
        cat = Category.objects.create(name="Temp", slug="temp")
        product = Product.objects.create(
            name="Temp Product", slug="temp-product", sku="TEMP-001",
            description="Temporary", price=Decimal("9.99"),
            category=cat, stock_quantity=10,
        )

        initial_stock = product.stock_quantity

        try:
            with transaction.atomic():
                product.stock_quantity -= 5
                product.save()
                raise Exception("Simulated failure")
        except Exception:
            pass

        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, initial_stock)

    def test_savepoint_nested_transaction(self):
        """Verify nested savepoints work correctly for partial rollback."""
        cat = Category.objects.create(name="Nested", slug="nested")
        product = Product.objects.create(
            name="Nested Product", slug="nested-product", sku="NEST-001",
            description="Nested test", price=Decimal("14.99"),
            category=cat, stock_quantity=100,
        )

        with transaction.atomic():
            product.stock_quantity -= 10
            product.save()

            try:
                with transaction.atomic():
                    product.stock_quantity -= 200  # will fail constraint
                    product.save()
                    # Force a check that would fail
                    if product.stock_quantity < 0:
                        raise ValueError("Negative stock")
            except ValueError:
                pass  # inner savepoint rolled back

            product.refresh_from_db()
            # Inner rolled back but outer still holds
            self.assertEqual(product.stock_quantity, 90)

    def test_select_for_update_locks_rows(self):
        """
        Verify PostgreSQL row-level locking via SELECT FOR UPDATE.
        This is a PostgreSQL-specific feature used in order processing.
        """
        cat = Category.objects.create(name="Locking", slug="locking")
        product = Product.objects.create(
            name="Lock Product", slug="lock-product", sku="LOCK-001",
            description="Lock test", price=Decimal("24.99"),
            category=cat, stock_quantity=10,
        )

        with transaction.atomic():
            locked = Product.objects.select_for_update().get(id=product.id)
            self.assertEqual(locked.stock_quantity, 10)
            locked.stock_quantity -= 1
            locked.save()

        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 9)
