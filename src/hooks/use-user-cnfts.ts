/**
 * Hook for fetching user's compressed NFTs via server-side API
 * API key stays secure on the server
 */

import { useQuery } from '@tanstack/react-query';
import type { CompressedNFT } from '@/lib/helius';

/**
 * Fetch compressed NFTs owned by the connected wallet
 */
const fetchUserCNFTs = async (
  walletAddress?: string
): Promise<CompressedNFT[]> => {
  if (!walletAddress) return [];

  try {
    console.log('🔍 Fetching cNFTs for wallet:', walletAddress);
    
    // Call our server-side API route instead of Helius directly
    const response = await fetch(`/api/helius?owner=${encodeURIComponent(walletAddress)}`);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch cNFTs');
    }
    
    const assets: CompressedNFT[] = result.data;
    console.log(`✅ Found ${assets.length} compressed NFT(s)`);
    
    if (assets.length > 0) {
      console.log('📋 cNFT Details:');
      assets.forEach((asset, index) => {
        console.log(`  ${index + 1}. ${asset.name || 'Unnamed'} (${asset.symbol})`);
        console.log(`     Asset ID: ${asset.id}`);
        console.log(`     Mint: ${asset.mint}`);
        console.log(`     Tree: ${asset.tree}`);
        console.log(`     Leaf ID: ${asset.leafId}`);
        console.log(`     Image: ${asset.image}`);
        if (asset.description) {
          console.log(`     Description: ${asset.description}`);
        }
        if (asset.attributes && asset.attributes.length > 0) {
          console.log(`     Attributes:`, asset.attributes);
        }
      });
    }
    
    return assets;
  } catch (error) {
    console.error('❌ Failed to fetch cNFTs:', error);
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Failed to fetch compressed NFTs'
    );
  }
};

/**
 * Hook to fetch user's compressed NFTs from Helius
 */
export const useUserCNFTs = (walletAddress?: string) => {
  return useQuery({
    queryKey: ['userCNFTs', walletAddress],
    queryFn: () => fetchUserCNFTs(walletAddress),
    enabled: !!walletAddress,
    staleTime: 30000, // 30 seconds
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });
};
