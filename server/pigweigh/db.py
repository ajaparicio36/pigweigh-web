from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from pigweigh.config import Settings


class Base(DeclarativeBase):
    pass


class Admin(Base):
    __tablename__ = "admin"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LoginSession(Base):
    __tablename__ = "session"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admin.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PriceRecord(Base):
    __tablename__ = "price_record"
    __table_args__ = (CheckConstraint("amount_centavos > 0", name="positive_price"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    amount_centavos: Mapped[int] = mapped_column(BigInteger)
    source_reference: Mapped[str] = mapped_column(String(500))
    publisher_id: Mapped[int] = mapped_column(ForeignKey("admin.id"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PriceState(Base):
    __tablename__ = "price_state"
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton_price_state"),
        CheckConstraint("revision >= 0", name="nonnegative_revision"),
    )
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    current_id: Mapped[int | None] = mapped_column(ForeignKey("price_record.id"))
    revision: Mapped[int] = mapped_column(BigInteger)


def make_engine(settings: Settings):
    return create_engine(settings.database, pool_size=5, max_overflow=0, pool_timeout=5,
                         pool_pre_ping=True, connect_args={"connect_timeout": 5})
