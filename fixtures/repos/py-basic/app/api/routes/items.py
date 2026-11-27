from fastapi import APIRouter
from app import crud
router = APIRouter()
@router.get("/")
def list_items():
    return crud.list_items()
@router.post("/")
def create_item():
    return crud.create_item()
