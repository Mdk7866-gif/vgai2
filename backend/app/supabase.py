from supabase import Client, create_client

from app.config import settings

def get_supabase_client() -> Client:
    """Returns a Supabase client using the service role / secret key."""
    return create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SECRET_KEY,
    )

supabase: Client = get_supabase_client()
