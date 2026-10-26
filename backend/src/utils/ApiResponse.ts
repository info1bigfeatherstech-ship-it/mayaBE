export function successResponse<T>(
  message: string,
  data?: T,
  extra?: Record<string, unknown>
) {
  return {
    success: true as const,
    message,
    ...(data !== undefined ? { data } : {}),
    ...extra,
  };
}
