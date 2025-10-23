export declare class HttpError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(statusCode: number, message: string, details?: unknown);
}
export declare class BadRequestError extends HttpError {
    constructor(message: string, details?: unknown);
}
export declare class UnauthorizedError extends HttpError {
    constructor(message?: string);
}
export declare class ForbiddenError extends HttpError {
    constructor(message?: string);
}
export declare class NotFoundError extends HttpError {
    constructor(message?: string);
}
export declare class ConflictError extends HttpError {
    constructor(message: string, details?: unknown);
}
export declare class InternalServerError extends HttpError {
    constructor(message?: string);
}
//# sourceMappingURL=http.d.ts.map