from alembic import context
from pigweigh.config import Settings
from pigweigh.db import Base, make_engine

config = context.config
if context.is_offline_mode():
    context.configure(url=Settings.from_env().database, target_metadata=Base.metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = make_engine(Settings.from_env())
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=Base.metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()
