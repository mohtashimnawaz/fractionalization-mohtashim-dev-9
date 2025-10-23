/**
 * Hook to mint a compressed NFT
 * 
 * Two modes:
 * 1. With NEXT_PUBLIC_MERKLE_TREE_ADDRESS: Uses pre-created tree, user signs & pays
 * 2. Without: Uses Helius Mint API (server-side signing)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWallet } from '@/components/solana/solana-provider';
import { Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
} from '@metaplex-foundation/umi';

interface MintCNFTParams {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
}

/**
 * Upload metadata to decentralized storage
 * 
 * ⚠️ TEMPORARY SOLUTION:
 * Returns a mock Arweave-style URL with a hash of the metadata.
 * In production, you MUST upload to real storage (Arweave/IPFS).
 * 
 * For production implementation:
 * 1. Upload image to Arweave/IPFS
 * 2. Create metadata JSON with image URI
 * 3. Upload metadata JSON to Arweave/IPFS
 * 4. Return the metadata URI
 * 
 * Tools: Metaplex Sugar CLI, Bundlr, nft.storage, Pinata
 */
function uploadMetadata(params: MintCNFTParams): string {
  // Create a deterministic hash from the NFT name for testing
  const hash = Array.from(params.name)
    .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    .toString(36)
    .padStart(43, 'x'); // Arweave hashes are 43 chars
  
  // Return a mock Arweave URL (max 200 chars for Bubblegum)
  // This is just for testing - in production, this must be a REAL uploaded metadata file
  const mockUri = `https://arweave.net/${hash}`;
  
  console.log('📝 Mock metadata URI:', mockUri);
  console.log('   Name:', params.name);
  console.log('   Symbol:', params.symbol);
  console.log('   ⚠️  Remember: Upload real metadata to Arweave/IPFS for production!');
  
  return mockUri;
}

/**
 * Mint cNFT using pre-created Merkle tree
 * User signs and pays for the transaction (~0.001 SOL)
 * Uses custom @wallet-ui/react wallet for transaction signing
 */
async function mintWithExistingTree(
  params: MintCNFTParams,
  customWallet: ReturnType<typeof useWallet>,
): Promise<{ signature: string; assetId: string }> {
  
  const treeAddress = process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;
  
  if (!treeAddress) {
    throw new Error('NEXT_PUBLIC_MERKLE_TREE_ADDRESS not configured. See TREE_SETUP_GUIDE.md');
  }

  if (!customWallet.account?.address) {
    throw new Error('Wallet not connected - cannot get public key');
  }

  // Initialize UMI with public RPC endpoint (no API key needed client-side)
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const endpoint = `https://api.${network}.solana.com`;
  const connection = new Connection(endpoint, 'confirmed');

  const umi = createUmi(endpoint)
    .use(mplBubblegum());

  console.log('Using existing Merkle tree:', treeAddress);
  console.log('Wallet:', customWallet.account.address);

  // Upload metadata
  const metadataUri = uploadMetadata(params);

  // Mint compressed NFT to existing tree
  console.log('Minting compressed NFT...');
  
  const leafOwner = umiPublicKey(customWallet.account.address);
  const merkleTree = umiPublicKey(treeAddress);
  
  const mintBuilder = mintV1(umi, {
    leafOwner,
    merkleTree,
    metadata: {
      name: params.name,
      symbol: params.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: 500, // 5% royalty
      collection: none(),
      creators: [
        {
          address: leafOwner,
          verified: false,
          share: 100,
        },
      ],
    },
  });

  // Build transaction
  const transactionBuilder = await mintBuilder.buildAndSign(umi);
  
  // For now, we'll send through UMI which will use the wallet adapter identity
  // But we need a custom signer that uses @wallet-ui/react
  
  // This is a simplified approach - in production you'd want proper signing
  try {
    // Create a connection and get the transaction
    const connection = new Connection(endpoint, 'confirmed');
    await connection.getLatestBlockhash();
    
    // We need to build this more carefully with proper signing
    console.log('⚠️ Note: Full Bubblegum transaction signing with @wallet-ui/react requires additional setup');
    
    // For now, throw a helpful error
    throw new Error(
      'Metaplex Bubblegum transaction signing requires additional wallet adapter configuration. ' +
      'Please use Mode 2 (Helius Mint API) or contact support.'
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('requires additional')) {
      throw error;
    }
    throw new Error(`Failed to mint: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mint a compressed NFT using Helius Mint API via our server-side route
 * This doesn't require wallet signature - Helius mints it for you
 */
async function mintWithHeliusAPI(
  params: MintCNFTParams,
  walletAddress: string,
): Promise<{ signature: string; assetId: string }> {
  
  // Call our server-side API route which has the API key
  const response = await fetch('/api/mint-cnft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: params.name,
      symbol: params.symbol,
      owner: walletAddress,
      description: params.description || `A compressed NFT: ${params.name}`,
      imageUrl: params.imageUrl || 'https://arweave.net/placeholder-image',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to mint cNFT');
  }

  return {
    signature: data.signature,
    assetId: data.assetId,
  };
}

export const useMintCNFT = () => {
  const customWallet = useWallet();
  const queryClient = useQueryClient();

  // Check if we should use existing tree (user-paid) or Helius API
  const useExistingTree = !!process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;

  return useMutation({
    mutationFn: async (params: MintCNFTParams) => {
      if (useExistingTree) {
        // Mode 1: Use existing tree with user wallet signing
        if (!customWallet.account?.address) {
          throw new Error('Wallet not connected - please connect wallet first');
        }

        console.log('🔐 Using existing tree - user will sign transaction');
        return await mintWithExistingTree(params, customWallet);
      } else {
        // Mode 2: Use Helius API (fallback)
        if (!customWallet.account?.address) {
          throw new Error('Wallet not connected - please connect wallet first');
        }

        console.log('⚡ Using Helius Mint API - no signature required');
        return await mintWithHeliusAPI(params, customWallet.account.address);
      }
    },
    onSuccess: (data) => {
      if (useExistingTree) {
        toast.success('🎉 cNFT Minted Successfully!', {
          description: 'You signed and paid for this transaction. Note: Using mock metadata URI for testing.',
          duration: 6000,
        });
      } else {
        toast.success('Compressed NFT Minted!', {
          description: `Asset ID: ${data.assetId.substring(0, 8)}...`,
          duration: 5000,
        });
      }

      // Wait for Helius indexing before refetching
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['user-cnfts'] });
      }, 3000);
      
      // Refetch again after 10 seconds to be sure
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['user-cnfts'] });
      }, 10000);
    },
    onError: (error: Error) => {
      console.error('Mint cNFT error:', error);
      
      let errorMessage = error.message;
      if (error.message.includes('NEXT_PUBLIC_MERKLE_TREE_ADDRESS')) {
        errorMessage = 'Merkle tree not configured. Check TREE_SETUP_GUIDE.md';
      }
      
      toast.error('Failed to Mint cNFT', {
        description: errorMessage,
        duration: 8000,
      });
    },
  });
};
