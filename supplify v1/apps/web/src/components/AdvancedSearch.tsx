'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

/**
 * Advanced Search Component
 * Elasticsearch-powered search with autocomplete
 */
export function AdvancedSearch({ onResultSelect }: { onResultSelect?: (result: any) => void }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Fetch search results
  const { data: results, isLoading } = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return { hits: [] };
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}&type=products`
      );
      return res.json();
    },
    enabled: debouncedQuery.length > 0,
  });

  // Fetch autocomplete suggestions
  const { data: suggestions } = useQuery({
    queryKey: ['suggestions', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      const res = await fetch(
        `/api/search/suggest?q=${encodeURIComponent(debouncedQuery)}&type=products`
      );
      return res.json();
    },
    enabled: debouncedQuery.length > 1,
  });

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search products, suppliers, orders..."
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isOpen && (query || results?.hits?.length > 0) && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2">Searching...</p>
            </div>
          ) : (
            <>
              {/* Suggestions */}
              {suggestions && suggestions.length > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Suggestions
                  </div>
                  {suggestions.slice(0, 5).map((suggestion: any, index: number) => (
                    <button
                      key={index}
                      onClick={() => {
                        setQuery(suggestion.text);
                        setDebouncedQuery(suggestion.text);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Search className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{suggestion.text}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Search Results */}
              {results?.hits && results.hits.length > 0 ? (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                    Products ({results.total})
                  </div>
                  {results.hits.slice(0, 10).map((hit: any) => (
                    <button
                      key={hit.id}
                      onClick={() => {
                        onResultSelect?.(hit);
                        setIsOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div
                            className="text-sm font-medium text-gray-900"
                            dangerouslySetInnerHTML={{
                              __html: hit.highlights?.name?.[0] || hit.name,
                            }}
                          />
                          {hit.description && (
                            <div
                              className="text-xs text-gray-500 mt-1 line-clamp-1"
                              dangerouslySetInnerHTML={{
                                __html: hit.highlights?.description?.[0] || hit.description,
                              }}
                            />
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {hit.brand && (
                              <span className="text-xs text-gray-500">{hit.brand}</span>
                            )}
                            {hit.category && (
                              <span className="text-xs text-gray-400">• {hit.category}</span>
                            )}
                          </div>
                        </div>
                        {hit.price && (
                          <div className="text-sm font-semibold text-gray-900 ml-4">
                            ${hit.price}
                          </div>
                        )}
                      </div>
                      {hit.score && (
                        <div className="text-xs text-gray-400 mt-1">
                          Relevance: {hit.score.toFixed(1)}
                        </div>
                      )}
                    </button>
                  ))}
                </>
              ) : debouncedQuery ? (
                <div className="p-4 text-center text-gray-500">
                  No results found for "{debouncedQuery}"
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

