from sqlmodel import select
from app.models import Item
def create_item():
    session.add(Item(name='item'))
def list_items():
    return session.exec(select(Item))
