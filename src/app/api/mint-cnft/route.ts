import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/mint-cnft
 * Mint a compressed NFT using Helius Mint API (server-side only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, symbol, owner, description, imageUrl } = body;

    // Validate required fields
    if (!name || !symbol || !owner) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, symbol, owner' },
        { status: 400 }
      );
    }

    // Get server-side API key
    const apiKey = process.env.HELIUS_API_KEY;
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Helius API key not configured on server' },
        { status: 500 }
      );
    }

    // Call Helius Mint API
    const response = await fetch(`https://${network}.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'helius-mint',
        method: 'mintCompressedNft',
        params: {
          name,
          symbol,
          owner,
          description: description || `A compressed NFT: ${name}`,
          attributes: [
            { trait_type: 'Type', value: 'Compressed NFT' },
            { trait_type: 'Created', value: new Date().toISOString() },
          ],
          imageUrl: imageUrl || 'https://arweave.net/placeholder-image',
          externalUrl: '',
          sellerFeeBasisPoints: 500,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Helius Mint API error:', errorText);
      return NextResponse.json(
        { success: false, error: `Helius API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.error) {
      console.error('Helius RPC error:', data.error);
      return NextResponse.json(
        { success: false, error: data.error.message || 'Helius RPC error' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      signature: data.result.signature,
      assetId: data.result.assetId,
    });
  } catch (error) {
    console.error('Mint cNFT API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to mint cNFT' 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    message: 'Mint cNFT API - Use POST method with name, symbol, owner, description, imageUrl',
    status: 'ready'
  });
}
