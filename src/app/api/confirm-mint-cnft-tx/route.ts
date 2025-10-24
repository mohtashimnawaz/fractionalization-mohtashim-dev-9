import { NextRequest, NextResponse } from 'next/server';
import { Connection, VersionedTransaction } from '@solana/web3.js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { serializedSignedTx, owner } = body;

    if (!serializedSignedTx || !owner) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: serializedSignedTx, owner' },
        { status: 400 }
      );
    }

    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
    const endpoint = `https://api.${network}.solana.com`;
    const connection = new Connection(endpoint, 'confirmed');

    console.log('📤 Confirming signed Bubblegum transaction...');
    console.log('  Owner:', owner);

    // Deserialize the signed transaction
    const txBuffer = Buffer.from(serializedSignedTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    console.log('✅ Transaction deserialized');

    // Send the signed transaction
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log('📡 Transaction sent:', signature);

    // Confirm the transaction
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Transaction confirmed:', signature);

    // Return success with signature
    // Note: Asset ID will be indexed by Helius after ~10-20 seconds
    return NextResponse.json({
      success: true,
      signature,
      assetId: 'pending-indexing', // Helius will index this after confirmation
      message: 'cNFT minted successfully! It will appear in your wallet after indexing completes (~10-20 seconds)',
    });
  } catch (error) {
    console.error('❌ Error confirming transaction:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to confirm transaction',
      },
      { status: 500 }
    );
  }
}
