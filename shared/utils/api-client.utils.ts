// shared/utils/api-client.utils.ts

import { ApiResponse } from '@/shared/types/common.types';

export interface ApiClientConfigType {
  baseURL?: string;
  headers?: HeadersInit;
  timeout?: number;
}

export interface RequestOptionsType extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ApiClient {
  private baseURL: string;
  private defaultHeaders: HeadersInit;
  private defaultTimeout: number;

  constructor(config: ApiClientConfigType = {}) {
    // FIXED: Don't include /api in baseURL since routes already include it
    // Set baseURL to empty string so paths like '/api/organizations' work correctly
    this.baseURL = config.baseURL || '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.defaultTimeout = config.timeout || 30000;
  }

  private buildURL(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    // FIXED: Simply append path to baseURL without double-prefixing
    const fullPath = `${this.baseURL}${path}`;
    const url = new URL(fullPath, window.location.origin);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  private async fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408, 'TIMEOUT');
      }
      throw error;
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      let errorCode = 'HTTP_ERROR';
      let errorDetails: unknown;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
        errorCode = errorData.error?.code || errorCode;
        errorDetails = errorData.error?.details;
      } catch {
        // If response is not JSON, use default error message
      }
      
      throw new ApiError(errorMessage, response.status, errorCode, errorDetails);
    }
    
    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }
    
    const data = await response.json();
    
    // Check if the response has success property
    if (data.success === false) {
      throw new ApiError(
        data.error?.message || 'Request failed',
        response.status,
        data.error?.code || 'REQUEST_FAILED',
        data.error?.details
      );
    }
    
    // If the response has data property (success: true), return data.data
    if (data.success === true && data.data !== undefined) {
      // If the response also has pagination, include it
      if (data.pagination) {
        return { data: data.data, pagination: data.pagination } as T;
      }
      return data.data as T;
    }
    
    // Otherwise return the whole response
    return data as T;
  }

  async get<T>(path: string, options?: RequestOptionsType): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options || {};
    const url = this.buildURL(path, params);
    
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: this.defaultHeaders,
      ...fetchOptions,
    }, timeout);
    
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptionsType): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options || {};
    const url = this.buildURL(path, params);
    
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: body ? JSON.stringify(body) : undefined,
      ...fetchOptions,
    }, timeout);
    
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptionsType): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options || {};
    const url = this.buildURL(path, params);
    
    const response = await this.fetchWithTimeout(url, {
      method: 'PUT',
      headers: this.defaultHeaders,
      body: body ? JSON.stringify(body) : undefined,
      ...fetchOptions,
    }, timeout);
    
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body?: unknown, options?: RequestOptionsType): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options || {};
    const url = this.buildURL(path, params);
    
    const response = await this.fetchWithTimeout(url, {
      method: 'PATCH',
      headers: this.defaultHeaders,
      body: body ? JSON.stringify(body) : undefined,
      ...fetchOptions,
    }, timeout);
    
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string, options?: RequestOptionsType): Promise<T> {
    const { params, timeout = this.defaultTimeout, ...fetchOptions } = options || {};
    const url = this.buildURL(path, params);
    
    const response = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers: this.defaultHeaders,
      ...fetchOptions,
    }, timeout);
    
    return this.handleResponse<T>(response);
  }

  setHeader(key: string, value: string): void {
    (this.defaultHeaders as Record<string, string>)[key] = value;
  }

  removeHeader(key: string): void {
    delete (this.defaultHeaders as Record<string, string>)[key];
  }

  setAuthToken(token: string | null): void {
    if (token) {
      this.setHeader('Authorization', `Bearer ${token}`);
    } else {
      this.removeHeader('Authorization');
    }
  }
}

// FIXED: Singleton instance with empty baseURL since all API routes already include /api prefix
export const apiClient = new ApiClient({
  baseURL: '',
});

// Re-export types with renamed names to avoid conflicts
export type { ApiClientConfigType as ApiClientConfig, RequestOptionsType as RequestOptions };