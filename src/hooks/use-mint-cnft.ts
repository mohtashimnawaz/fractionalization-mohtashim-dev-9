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
import { useWallet as useWalletAdapter, useConnection } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
} from '@metaplex-foundation/umi';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';

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
 */
async function mintWithExistingTree(
  params: MintCNFTParams,
  connection: Connection,
  walletAdapter: WalletContextState,
): Promise<{ signature: string; assetId: string }> {
  
  const treeAddress = process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;
  
  if (!treeAddress) {
    throw new Error('NEXT_PUBLIC_MERKLE_TREE_ADDRESS not configured. See TREE_SETUP_GUIDE.md');
  }

  // Initialize UMI with connection
  // Note: We use the connection's RPC endpoint (no API key needed client-side)
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const endpoint = `https://api.${network}.solana.com`;

  const umi = createUmi(endpoint)
    .use(mplBubblegum())
    .use(walletAdapterIdentity(walletAdapter));

  console.log('Using existing Merkle tree:', treeAddress);

  // Upload metadata
  const metadataUri = uploadMetadata(params);

  // Mint compressed NFT to existing tree
  console.log('Minting compressed NFT...');
  
  const leafOwner = umiPublicKey(walletAdapter.publicKey!.toBase58());
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

  const result = await mintBuilder.sendAndConfirm(umi);
  
  const signature = Buffer.from(result.signature).toString('base64');
  
  return { signature, assetId: 'pending-indexing' };
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
  const { account } = useWallet();
  const walletAdapter = useWalletAdapter();
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  // Check if we should use existing tree (user-paid) or Helius API
  const useExistingTree = !!process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;

  return useMutation({
    mutationFn: async (params: MintCNFTParams) => {
      if (useExistingTree) {
        // Mode 1: Use existing tree with user wallet signing
        if (!walletAdapter.publicKey) {
          throw new Error('Wallet not connected');
        }

        if (!walletAdapter.signTransaction) {
          throw new Error('Wallet does not support transaction signing');
        }

        console.log('🔐 Using existing tree - user will sign transaction');
        return await mintWithExistingTree(params, connection, walletAdapter);
      } else {
        // Mode 2: Use Helius API (fallback)
        if (!account?.address) {
          throw new Error('Wallet not connected');
        }

        console.log('⚡ Using Helius Mint API - no signature required');
        return await mintWithHeliusAPI(params, account.address);
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
