"""Admin sessions and immutable price publication."""
from alembic import op
import sqlalchemy as sa

revision = "0001_core"
down_revision = None


def upgrade() -> None:
    op.create_table("admin",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("disabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("session",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("admin_id", sa.BigInteger(), sa.ForeignKey("admin.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)))
    op.create_index("ix_session_admin_id", "session", ["admin_id"])
    op.create_index("ix_session_expires_at", "session", ["expires_at"])
    op.create_table("price_record",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("amount_centavos", sa.BigInteger(), nullable=False),
        sa.Column("source_reference", sa.String(500), nullable=False),
        sa.Column("publisher_id", sa.BigInteger(), sa.ForeignKey("admin.id"), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_centavos > 0", name="positive_price"))
    op.create_table("price_state",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column("current_id", sa.BigInteger(), sa.ForeignKey("price_record.id")),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("id = 1", name="singleton_price_state"),
        sa.CheckConstraint("revision >= 0", name="nonnegative_revision"))
    op.execute("INSERT INTO price_state (id, current_id, revision) VALUES (1, NULL, 0)")
    # No application endpoint updates/deletes records; enforce immutability in PostgreSQL too.
    op.execute("""CREATE FUNCTION prevent_price_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Price records are immutable'; END; $$""")
    op.execute("""CREATE TRIGGER immutable_price BEFORE UPDATE OR DELETE ON price_record
        FOR EACH ROW EXECUTE FUNCTION prevent_price_mutation()""")


def downgrade() -> None:
    op.drop_table("price_state")
    op.drop_table("price_record")
    op.execute("DROP FUNCTION prevent_price_mutation()")
    op.drop_table("session")
    op.drop_table("admin")
