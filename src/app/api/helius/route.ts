import { NextRequest, NextResponse } from 'next/server';
import { getAssetsByOwner, getAsset, getAssetProof } from '@/lib/helius';

/**
 * GET /api/helius/assets-by-owner?owner=<address>
 * Fetch all compressed NFTs owned by an address
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get('owner');
    const assetId = searchParams.get('assetId');
    const proof = searchParams.get('proof');

    // Route: /api/helius?owner=<address>
    if (owner) {
      const assets = await getAssetsByOwner(owner);
      return NextResponse.json({ success: true, data: assets });
    }

    // Route: /api/helius?assetId=<id>&proof=true
    if (assetId && proof === 'true') {
      const assetProof = await getAssetProof(assetId);
      return NextResponse.json({ success: true, data: assetProof });
    }

    // Route: /api/helius?assetId=<id>
    if (assetId) {
      const asset = await getAsset(assetId);
      return NextResponse.json({ success: true, data: asset });
    }

    return NextResponse.json(
      { success: false, error: 'Missing required parameter: owner, assetId, or proof' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Helius API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch from Helius API' 
      },
      { status: 500 }
    );
  }
}