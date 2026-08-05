from pydantic import BaseModel


class User(BaseModel):
    id: str
    name: str | None = None
    email: str
    profile_image_url: str | None = None
    current_credit_balance: float
    miscellaneous_credit_spent: float

    class Config:
        from_attributes = True
