from sqlmodel import SQLModel
class Item(SQLModel, table=True):
    name: str
