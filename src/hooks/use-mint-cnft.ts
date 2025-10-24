import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWallet } from '@/components/solana/solana-provider';
import { useWallet as useWalletAdapter, useConnection } from '@solana/wallet-adapter-react';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplBubblegum, mintV1 } from '@metaplex-foundation/mpl-bubblegum';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi';
import { none } from '@metaplex-foundation/umi';

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
 * Mint cNFT using pre-created Merkle tree with Metaplex Bubblegum
 * User signs and pays for the transaction (~0.001 SOL)
 * 
 * Uses UMI + walletAdapterIdentity for proper wallet integration
 */
async function mintWithExistingTree(
  params: MintCNFTParams,
  connection: Connection,
  walletAdapter: WalletContextState,
): Promise<{ signature: string; assetId: string }> {
  
  const treeAddress = process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;
  
  if (!treeAddress) {
    throw new Error('NEXT_PUBLIC_MERKLE_TREE_ADDRESS not configured. Check TREE_SETUP_GUIDE.md');
  }

  if (!walletAdapter.publicKey) {
    throw new Error('Wallet not connected');
  }

  const apiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_HELIUS_API_KEY not configured');
  }

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const endpoint = `https://${network}.helius-rpc.com/?api-key=${apiKey}`;

  console.log('🔐 Mode 1: Metaplex Bubblegum with user wallet signing');
  console.log('Wallet:', walletAdapter.publicKey.toBase58());
  console.log('Tree:', treeAddress);

  const metadataUri = uploadMetadata(params);

  try {
    // Create UMI instance with wallet adapter identity
    const umi = createUmi(endpoint)
      .use(mplBubblegum())
      .use(walletAdapterIdentity(walletAdapter)); // KEY: This connects the wallet for signing

    const leafOwner = umiPublicKey(walletAdapter.publicKey.toBase58());
    const merkleTree = umiPublicKey(treeAddress);

    console.log('📝 Building and signing transaction with UMI...');

    // Build the mint transaction
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

    // This will trigger the wallet popup for user to sign and pay
    console.log('�️ Requesting wallet signature...');
    const result = await mintBuilder.sendAndConfirm(umi);

    const signature = Buffer.from(result.signature).toString('base64');

    console.log('✅ Transaction confirmed!');
    console.log('Signature:', signature);

    return {
      signature,
      assetId: 'pending-indexing', // Helius needs time to index
    };
  } catch (error) {
    console.error('❌ Mint error:', error);
    throw new Error(
      error instanceof Error 
        ? error.message 
        : 'Failed to mint cNFT'
    );
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
  const walletAdapter = useWalletAdapter(); // Primary: wallet-adapter for signing
  const { connection } = useConnection();
  const queryClient = useQueryClient();

  // Check if we should use existing tree (user-paid) or Helius API
  const useExistingTree = !!process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;

  return useMutation({
    mutationFn: async (params: MintCNFTParams) => {
      // Debug logging
      console.log('🔍 Wallet Debug Info:');
      console.log('  wallet-adapter publicKey:', walletAdapter.publicKey?.toBase58());
      console.log('  wallet-adapter connected:', walletAdapter.connected);
      console.log('  wallet-adapter connecting:', walletAdapter.connecting);
      
      if (useExistingTree) {
        // Mode 1: Use existing tree with user wallet signing
        if (!walletAdapter.connected || !walletAdapter.publicKey) {
          console.error('❌ Wallet adapter not connected!');
          console.log('Wallet adapter state:', {
            connected: walletAdapter.connected,
            connecting: walletAdapter.connecting,
            publicKey: walletAdapter.publicKey?.toBase58(),
            wallet: walletAdapter.wallet?.adapter?.name,
          });
          throw new Error('Wallet not connected to adapter - please reconnect your wallet');
        }

        console.log('🔐 Using existing tree - user will sign transaction');
        return await mintWithExistingTree(params, connection, walletAdapter);
      } else {
        // Mode 2: Use Helius API (fallback)
        if (!walletAdapter.publicKey) {
          throw new Error('Wallet not connected - please connect wallet first');
        }

        console.log('⚡ Using Helius Mint API - no signature required');
        return await mintWithHeliusAPI(params, walletAdapter.publicKey.toBase58());
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
