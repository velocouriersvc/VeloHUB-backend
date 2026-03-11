// ── Shared Pagination Types ─────────────────────────────────────────

/**
 * Standard pagination request params (from query string).
 */
export interface PaginationParams {
    page?: number;
    limit?: number;
}

/**
 * Standard paginated response envelope.
 */
export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

/**
 * Helper to build a PaginatedResult from findAndCount output.
 */
export function paginate<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
): PaginatedResult<T> {
    return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Normalise raw query params into safe pagination values.
 */
export function parsePagination(
    raw: { page?: string | number; limit?: string | number },
    maxLimit = 50
): { page: number; limit: number; offset: number } {
    const page = Math.max(Number(raw.page) || 1, 1);
    const limit = Math.min(Math.max(Number(raw.limit) || 20, 1), maxLimit);
    return { page, limit, offset: (page - 1) * limit };
}
