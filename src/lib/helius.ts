import { PublicKey } from '@solana/web3.js';

// Helius API configuration
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY || '';
const HELIUS_RPC_URL = `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

if (!HELIUS_API_KEY) {
  console.warn('NEXT_PUBLIC_HELIUS_API_KEY not set. Some Helius calls will fail.');
}

export interface DASAsset {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  compression?: { tree: string; leaf_id: number; compressed: boolean };
  ownership: { owner: string };
}

export interface AssetProof {
  root: string;
  proof: string[];
  node_index: number;
  leaf: string;
  tree_id: string;
}

export interface CompressedNFT {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: any[];
  tree: string;
  leafId: number;
  owner: string;
}

async function callDASApi<T>(method: string, params: unknown): Promise<T> {
  if (!HELIUS_API_KEY) throw new Error('Helius API key not configured');

  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'helius', method, params }),
  });

  if (!response.ok) throw new Error(`Helius error ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.result;
}

export async function getAssetsByOwner(ownerAddress: string): Promise<CompressedNFT[]> {
  const result = await callDASApi<{ items: DASAsset[] }>('getAssetsByOwner', { ownerAddress, page: 1, limit: 1000 });
  return (result.items || [])
    .filter((a) => a.compression?.compressed)
    .map((a) => ({
      id: a.id,
      mint: a.id,
      name: a.content?.metadata?.name || 'Unnamed',
      symbol: a.content?.metadata?.symbol || '',
      description: a.content?.metadata?.description,
      image: a.content?.links?.image || a.content?.files?.[0]?.uri || '/placeholder-nft.png',
      attributes: a.content?.metadata?.attributes,
      tree: a.compression!.tree,
      leafId: a.compression!.leaf_id,
      owner: a.ownership.owner,
    }));
}

export async function getAsset(assetId: string): Promise<DASAsset> {
  return await callDASApi<DASAsset>('getAsset', { id: assetId });
}

export async function getAssetProof(assetId: string): Promise<AssetProof> {
  return await callDASApi<AssetProof>('getAssetProof', { id: assetId });
}

export function proofToAccounts(proof: AssetProof): PublicKey[] {
  return proof.proof.map((n) => new PublicKey(n));
}

export function getHeliusRpcUrl(): string {
  return HELIUS_RPC_URL;
}
