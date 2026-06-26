import requests
import json

url = "https://api.velocouriersvc.com/api/v1/admin/supabase/tables/profiles?page=1&limit=50"
# We need to bypass auth if we don't have it, but wait! The endpoint requires authentication.
# I need to see what the production endpoint returns in the body.
# Do we have the admin API key or token in .env or somewhere?
