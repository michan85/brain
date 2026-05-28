"""
User and UserProfile models for the ecommerce application.

Users have unique email constraints, foreign keys to orders and reviews,
and profile data used in reporting aggregations.
"""

from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.validators import MinValueValidator
from decimal import Decimal


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom user model with email as the unique identifier.
    Has FK relationships to orders, reviews, wishlists, and shipping addresses.
    """

    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)

    # Denormalized fields used in reporting dashboards
    email_verified = models.BooleanField(default=False)
    phone = models.CharField(max_length=20, blank=True, default="")
    referral_source = models.CharField(max_length=50, blank=True, default="")

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["date_joined"]),
            models.Index(fields=["is_active", "date_joined"]),
        ]

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class UserProfile(models.Model):
    """
    Extended profile data. One-to-one with User.
    Aggregated fields (total_spent, order_count) are updated transactionally
    during order creation/cancellation.
    """

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    tier = models.CharField(
        max_length=20,
        choices=[
            ("bronze", "Bronze"),
            ("silver", "Silver"),
            ("gold", "Gold"),
            ("platinum", "Platinum"),
        ],
        default="bronze",
    )
    total_spent = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    order_count = models.PositiveIntegerField(default=0)
    loyalty_points = models.PositiveIntegerField(default=0)
    preferred_currency = models.CharField(max_length=3, default="USD")
    newsletter_subscribed = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["tier"]),
            models.Index(fields=["total_spent"]),
        ]


class UserActivity(models.Model):
    """
    Activity log for user behavior tracking. Used in cohort analysis reports
    that JOIN across users, orders, and products.
    """

    class ActivityType(models.TextChoices):
        PAGE_VIEW = "page_view", "Page View"
        SEARCH = "search", "Search"
        ADD_TO_CART = "add_to_cart", "Add to Cart"
        REMOVE_FROM_CART = "remove_from_cart", "Remove from Cart"
        WISHLIST_ADD = "wishlist_add", "Wishlist Add"
        CHECKOUT_START = "checkout_start", "Checkout Start"
        PURCHASE = "purchase", "Purchase"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activities")
    activity_type = models.CharField(max_length=30, choices=ActivityType.choices, db_index=True)
    product = models.ForeignKey(
        "product.Product", on_delete=models.SET_NULL, null=True, blank=True
    )
    session_id = models.CharField(max_length=64, db_index=True)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "activity_type", "created_at"]),
            models.Index(fields=["created_at"]),
        ]


class Review(models.Model):
    """Product reviews by users. Used in product rating aggregations."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reviews")
    product = models.ForeignKey(
        "product.Product", on_delete=models.CASCADE, related_name="reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1)],
        help_text="Rating from 1 to 5",
    )
    title = models.CharField(max_length=200)
    body = models.TextField()
    is_verified_purchase = models.BooleanField(default=False)
    helpful_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("user", "product")]
        indexes = [
            models.Index(fields=["product", "rating"]),
            models.Index(fields=["created_at"]),
        ]
