"""
FastAPI endpoint for querying orders from Supabase PostgreSQL
Simplified version without heavy dependencies
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import os
import httpx
import logging
from dotenv import load_dotenv
from supabase import create_client, Client
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Orders API",
    description="Optimized API for querying orders from Supabase",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase connection
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("=" * 60)
    logger.error("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    logger.error("=" * 60)
    logger.error("Please create a .env file in the api/orders directory with:")
    logger.error("SUPABASE_URL=https://your-project-id.supabase.co")
    logger.error("SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here")
    logger.error("=" * 60)
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file")

# Initialize Supabase client
supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Thread pool for running sync Supabase client in async context
executor = ThreadPoolExecutor(max_workers=5)

# Response models
class OrderResponse(BaseModel):
    order_date: Optional[date] = None
    total_amount_vnd: Optional[Decimal] = None
    country: Optional[str] = None
    product: Optional[str] = None
    tracking_code: Optional[str] = None
    marketing_staff: Optional[str] = None
    sale_staff: Optional[str] = None
    team: Optional[str] = None
    
    class Config:
        extra = "allow"  # Allow extra fields from database

class OrdersListResponse(BaseModel):
    data: List[dict]  # Use dict to preserve all fields from database
    total: int


@app.get("/", response_model=OrdersListResponse)
async def get_orders(
    order_date_from: Optional[date] = Query(None, alias="order_date_from"),
    order_date_to: Optional[date] = Query(None, alias="order_date_to"),
    total_amount_vnd_min: Optional[float] = Query(None, alias="total_amount_vnd_min"),
    total_amount_vnd_max: Optional[float] = Query(None, alias="total_amount_vnd_max"),
    country: Optional[str] = Query(None),
    product: Optional[str] = Query(None),
    tracking_code: Optional[str] = Query(None),
    marketing_staff: Optional[str] = Query(None),
    sale_staff: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("order_date"),
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$")
):
    """Get orders with filtering and sorting. Returns all matching records."""
    try:
        # Build query using Supabase Python client (handles PostgREST format correctly)
        query = supabase_client.table("orders").select("*", count="exact")
        
        # Apply filters
        if order_date_from:
            date_from_str = order_date_from.isoformat()
            query = query.gte("order_date", date_from_str)
            logger.info(f"Filter: order_date >= {date_from_str}")
        if order_date_to:
            date_to_str = order_date_to.isoformat()
            query = query.lte("order_date", date_to_str)
            logger.info(f"Filter: order_date <= {date_to_str}")
        if total_amount_vnd_min is not None:
            query = query.gte("total_amount_vnd", total_amount_vnd_min)
        if total_amount_vnd_max is not None:
            query = query.lte("total_amount_vnd", total_amount_vnd_max)
        if country:
            query = query.eq("country", country)
        if product:
            query = query.eq("product", product)
        if tracking_code:
            query = query.eq("tracking_code", tracking_code)
        if marketing_staff:
            query = query.eq("marketing_staff", marketing_staff)
        if sale_staff:
            query = query.eq("sale_staff", sale_staff)
        if team:
            query = query.eq("team", team)
        
        # Add sorting
        order = sort_order or "desc"
        query = query.order(sort_by, desc=(order == "desc"))
        
        # Log query details
        has_filters = any([
            order_date_from, order_date_to,
            total_amount_vnd_min is not None, total_amount_vnd_max is not None,
            country, product, tracking_code, marketing_staff, sale_staff, team
        ])
        
        if has_filters:
            logger.info(f"Executing query WITH filters: order_date_from={order_date_from}, order_date_to={order_date_to}")
        else:
            logger.info(f"Executing query WITHOUT filters - fetching all data")
        
        # First, get total count
        loop = asyncio.get_event_loop()
        count_query = supabase_client.table("orders").select("*", count="exact", head=True)
        
        # Apply same filters for count
        if order_date_from:
            count_query = count_query.gte("order_date", order_date_from.isoformat())
        if order_date_to:
            count_query = count_query.lte("order_date", order_date_to.isoformat())
        if total_amount_vnd_min is not None:
            count_query = count_query.gte("total_amount_vnd", total_amount_vnd_min)
        if total_amount_vnd_max is not None:
            count_query = count_query.lte("total_amount_vnd", total_amount_vnd_max)
        if country:
            count_query = count_query.eq("country", country)
        if product:
            count_query = count_query.eq("product", product)
        if tracking_code:
            count_query = count_query.eq("tracking_code", tracking_code)
        if marketing_staff:
            count_query = count_query.eq("marketing_staff", marketing_staff)
        if sale_staff:
            count_query = count_query.eq("sale_staff", sale_staff)
        if team:
            count_query = count_query.eq("team", team)
        
        count_response = await loop.run_in_executor(executor, lambda: count_query.execute())
        total = count_response.count if hasattr(count_response, 'count') and count_response.count is not None else 0
        logger.info(f"Total records to fetch: {total}")
        
        # Fetch all records by looping through pages (Supabase limit: 1000 per request)
        PAGE_SIZE = 1000
        all_data = []
        offset = 0
        page_num = 1
        max_pages = (total // PAGE_SIZE) + 2 if total > 0 else 100  # Safety limit
        
        while page_num <= max_pages:
            # Build query for current page
            page_query = supabase_client.table("orders").select("*")
            
            # Apply filters
            if order_date_from:
                page_query = page_query.gte("order_date", order_date_from.isoformat())
            if order_date_to:
                page_query = page_query.lte("order_date", order_date_to.isoformat())
            if total_amount_vnd_min is not None:
                page_query = page_query.gte("total_amount_vnd", total_amount_vnd_min)
            if total_amount_vnd_max is not None:
                page_query = page_query.lte("total_amount_vnd", total_amount_vnd_max)
            if country:
                page_query = page_query.eq("country", country)
            if product:
                page_query = page_query.eq("product", product)
            if tracking_code:
                page_query = page_query.eq("tracking_code", tracking_code)
            if marketing_staff:
                page_query = page_query.eq("marketing_staff", marketing_staff)
            if sale_staff:
                page_query = page_query.eq("sale_staff", sale_staff)
            if team:
                page_query = page_query.eq("team", team)
            
            # Apply sorting and pagination
            page_query = page_query.order(sort_by, desc=(order == "desc"))
            page_query = page_query.range(offset, offset + PAGE_SIZE - 1)
            
            # Execute query
            logger.info(f"Fetching page {page_num} (offset: {offset}, limit: {PAGE_SIZE})...")
            response = await loop.run_in_executor(executor, lambda: page_query.execute())
            page_data = response.data if response.data else []
            
            if not page_data:
                logger.info(f"No more data at page {page_num}, stopping...")
                break
                
            all_data.extend(page_data)
            logger.info(f"Page {page_num}: Got {len(page_data)} records. Total fetched: {len(all_data)}/{total if total > 0 else '?'}")
            
            # Stop if we got less than PAGE_SIZE (means last page)
            if len(page_data) < PAGE_SIZE:
                logger.info(f"Got less than {PAGE_SIZE} records, this is the last page")
                break
            
            # Stop if we reached or exceeded total
            if total > 0 and len(all_data) >= total:
                logger.info(f"Reached total count: {total}")
                break
                
            offset += PAGE_SIZE
            page_num += 1
        
        data = all_data
        if total == 0:
            total = len(data)
            logger.info(f"Total was 0, using actual fetched count: {total}")
        
        logger.info(f"✅ Final: Fetched {len(data)} records (expected: {total})")
        
        # Debug: Log response details
        logger.info(f"Records returned: {len(data)}")
        logger.info(f"Total count: {total}")
        
        # Debug: Log first record to see actual data structure
        if data and len(data) > 0:
            first_record = data[0]
            logger.info(f"Sample record keys from Supabase: {list(first_record.keys())}")
            # Check for product field with different cases
            product_keys = [k for k in first_record.keys() if k.lower() == 'product']
            logger.info(f"Product-related keys found: {product_keys}")
            for key in product_keys:
                logger.info(f"  {key} = {first_record.get(key)}")
            # Check order_date in first few records
            logger.info(f"First 3 order_date values: {[r.get('order_date') for r in data[:3]]}")
        
        # Return orders as-is from Supabase (just normalize keys to lowercase for consistency)
        orders = []
        for order in data:
            # Convert to dict and normalize all keys to lowercase
            order_dict = order if isinstance(order, dict) else dict(order)
            normalized_order = {k.lower(): v for k, v in order_dict.items()}
            orders.append(normalized_order)
        
        return OrdersListResponse(
            data=orders,
            total=total
        )
        
    except Exception as e:
        logger.error(f"Error querying orders: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error querying orders: {str(e)}")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
