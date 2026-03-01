"""
FastAPI endpoint for querying orders from Supabase PostgreSQL
Optimized with proper indexing and query optimization
"""

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import os
from supabase import create_client, Client
import logging

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
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase connection
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Use service role key for admin operations

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Response models
class OrderResponse(BaseModel):
    order_date: Optional[date]
    total_amount_vnd: Optional[Decimal]
    country: Optional[str]
    product: Optional[str]
    tracking_code: Optional[str]
    marketing_staff: Optional[str]
    sale_staff: Optional[str]
    team: Optional[str]

class OrdersListResponse(BaseModel):
    data: List[OrderResponse]
    total: int
    page: int
    page_size: int
    total_pages: int

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None


@app.get("/", response_model=OrdersListResponse)
async def get_orders(
    # Filter parameters
    order_date_from: Optional[date] = Query(None, alias="order_date_from", description="Filter orders from this date"),
    order_date_to: Optional[date] = Query(None, alias="order_date_to", description="Filter orders to this date"),
    total_amount_vnd_min: Optional[float] = Query(None, alias="total_amount_vnd_min", description="Minimum total amount"),
    total_amount_vnd_max: Optional[float] = Query(None, alias="total_amount_vnd_max", description="Maximum total amount"),
    country: Optional[str] = Query(None, description="Filter by country (exact match)"),
    product: Optional[str] = Query(None, description="Filter by product (exact match)"),
    tracking_code: Optional[str] = Query(None, description="Filter by tracking code (exact match)"),
    marketing_staff: Optional[str] = Query(None, description="Filter by marketing staff (exact match)"),
    sale_staff: Optional[str] = Query(None, description="Filter by sale staff (exact match)"),
    team: Optional[str] = Query(None, description="Filter by team (exact match)"),
    
    # Pagination
    page: int = Query(1, ge=1, description="Page number (starts from 1)"),
    page_size: int = Query(10, ge=1, le=100, description="Number of records per page (10 or 100)"),
    
    # Sorting
    sort_by: Optional[str] = Query("order_date", description="Field to sort by"),
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$", description="Sort order: asc or desc")
):
    """
    Get orders with filtering, pagination, and sorting.
    Optimized query with proper indexing support.
    """
    try:
        # Build query
        query = supabase.table("orders").select("*", count="exact")
        
        # Apply filters (order matters for index usage)
        # 1. Date range filter (most selective, use index on order_date)
        if order_date_from:
            query = query.gte("order_date", order_date_from.isoformat())
        if order_date_to:
            query = query.lte("order_date", order_date_to.isoformat())
        
        # 2. Amount range filter
        if total_amount_vnd_min is not None:
            query = query.gte("total_amount_vnd", total_amount_vnd_min)
        if total_amount_vnd_max is not None:
            query = query.lte("total_amount_vnd", total_amount_vnd_max)
        
        # 3. Exact match filters (use indexes on these columns)
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
        
        # Apply sorting
        if sort_by:
            order = sort_order or "desc"
            query = query.order(sort_by, desc=(order == "desc"))
        
        # Calculate pagination
        offset = (page - 1) * page_size
        query = query.range(offset, offset + page_size - 1)
        
        # Execute query
        logger.info(f"Executing query with filters: page={page}, page_size={page_size}")
        response = query.execute()
        
        # Parse response (Supabase returns data and count separately)
        data = response.data if response.data else []
        # Get total count from separate count query if needed
        if hasattr(response, 'count'):
            total = response.count
        else:
            # Fallback: get count separately if not included
            count_query = supabase.table("orders").select("*", count="exact")
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
            
            count_response = count_query.limit(0).execute()
            total = count_response.count if hasattr(count_response, 'count') else len(data)
        
        # Convert to response model
        orders = [OrderResponse(**order) for order in data]
        
        total_pages = (total + page_size - 1) // page_size if total > 0 else 0
        
        return OrdersListResponse(
            data=orders,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages
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
