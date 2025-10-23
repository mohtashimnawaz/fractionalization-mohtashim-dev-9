/**
 * Hook for fetching compressed NFT asset details via server-side API
 */

import { useQuery } from '@tanstack/react-query';
import type { DASAsset } from '@/lib/helius';

/**
 * Fetch detailed asset information for a specific cNFT
 */
const fetchCNFTAsset = async (assetId?: string): Promise<DASAsset | null> => {
  if (!assetId) return null;

  try {
    const response = await fetch(`/api/helius?assetId=${encodeURIComponent(assetId)}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch asset');
    }
    
    return result.data;
  } catch (error) {
    console.error('Failed to fetch cNFT asset:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to fetch asset details'
    );
  }
};

/**
 * Hook to fetch detailed cNFT asset information
 */
export const useCNFTAsset = (assetId?: string) => {
  return useQuery({
    queryKey: ['cnftAsset', assetId],
    queryFn: () => fetchCNFTAsset(assetId),
    enabled: !!assetId,
    staleTime: 60000, // 1 minute
    retry: 2,
  });
};
