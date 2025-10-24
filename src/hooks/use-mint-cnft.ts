import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWallet } from '@/components/solana/solana-provider';
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mintV1, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import {
  publicKey as umiPublicKey,
  none,
  signerIdentity,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi';
import { fromWeb3JsKeypair, fromWeb3JsTransaction, toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters';

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
 * NOTE: This is a stub implementation. Full Bubblegum + wallet signing integration
 * requires UMI-compatible signing which is not yet implemented with @wallet-ui/react-gill.
 * 
 * For production, use Mode 2 (Helius Mint API) which is fully functional.
 */
async function mintWithExistingTree(
  params: MintCNFTParams,
  customWallet: ReturnType<typeof useWallet>,
): Promise<{ signature: string; assetId: string }> {
  
  const treeAddress = process.env.NEXT_PUBLIC_MERKLE_TREE_ADDRESS;
  
  if (!treeAddress) {
    throw new Error('NEXT_PUBLIC_MERKLE_TREE_ADDRESS not configured');
  }

  if (!customWallet.account?.address) {
    throw new Error('Wallet not connected');
  }

  if (!customWallet.client) {
    throw new Error('Wallet client not available');
  }

  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  const endpoint = `https://api.${network}.solana.com`;

  console.log('🔐 Mode 1: Metaplex Bubblegum with user wallet signing');
  console.log('Wallet:', customWallet.account.address);
  console.log('Tree:', treeAddress);

  const metadataUri = uploadMetadata(params);

  try {
    // Step 1: Request server to build the transaction
    console.log('📝 Step 1: Requesting server to build Bubblegum transaction...');
    
    const buildResponse = await fetch('/api/build-mint-cnft-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner: customWallet.account.address,
        treeAddress,
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        uri: metadataUri,
      }),
    });

    if (!buildResponse.ok) {
      const errorData = await buildResponse.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `Build API error: ${buildResponse.status}`);
    }

    const buildData = await buildResponse.json();
    
    if (!buildData.success) {
      throw new Error(buildData.error || 'Failed to build Bubblegum transaction');
    }

    console.log('✅ Got transaction from server');

    // Step 2: Get user's wallet to sign the transaction
    console.log('🖊️ Step 2: Requesting wallet signature...');
    
    // Access browser wallet
    interface SolanaWallet {
      signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
      signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
      publicKey: PublicKey;
      isConnected: boolean;
    }
    
    interface WindowWithSolana {
      solana?: SolanaWallet;
      phantom?: { solana?: SolanaWallet };
    }
    
    const solana = (window as unknown as WindowWithSolana)?.solana || (window as unknown as WindowWithSolana)?.phantom?.solana;
    
    if (!solana || !solana.isConnected) {
      throw new Error('Please connect your Phantom or Solflare wallet first');
    }

    try {
      // Deserialize the transaction
      const txBuffer = Buffer.from(buildData.serializedTx, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);

      console.log('� Transaction deserialized, requesting wallet signature...');

      // Request wallet to sign the transaction
      const signedTx = await solana.signTransaction(transaction);
      
      console.log('✅ Transaction signed by wallet!');

      // Send the signed transaction
      const connection = new Connection(endpoint, 'confirmed');
      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      console.log('📡 Transaction sent:', signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: buildData.blockhash,
        lastValidBlockHeight: buildData.lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ Transaction confirmed!');

      return {
        signature,
        assetId: 'pending-indexing',
      };
    } catch (signError) {
      console.error('❌ Signing/sending error:', signError);
      throw new Error(
        signError instanceof Error ? signError.message : 'Failed to sign or send transaction'
      );
    }
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
