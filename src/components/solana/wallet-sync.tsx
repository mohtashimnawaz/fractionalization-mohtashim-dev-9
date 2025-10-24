'use client';

import { useEffect } from 'react';
import { useWallet } from '@/components/solana/solana-provider';
import { useWallet as useWalletAdapter } from '@solana/wallet-adapter-react';

/**
 * Wallet Sync Component
 * 
 * Ensures both wallet systems (wallet-ui and wallet-adapter) are connected
 * to the same wallet. This is necessary because:
 * - wallet-ui is used for UI display
 * - wallet-adapter is used for transaction signing with Metaplex
 * 
 * When wallet-ui connects, this component attempts to connect wallet-adapter
 * to the same wallet.
 */
export function WalletSync() {
  const { account, connected: walletUiConnected } = useWallet();
  const { 
    connected: walletAdapterConnected, 
    publicKey: walletAdapterPublicKey,
    wallet: walletAdapterWallet,
    select,
    connect,
    disconnect
  } = useWalletAdapter();

  useEffect(() => {
    console.log('🔄 Wallet Sync Status:');
    console.log('  wallet-ui connected:', walletUiConnected);
    console.log('  wallet-ui address:', account?.address);
    console.log('  wallet-adapter connected:', walletAdapterConnected);
    console.log('  wallet-adapter address:', walletAdapterPublicKey?.toBase58());
    console.log('  wallet-adapter wallet:', walletAdapterWallet?.adapter?.name);

    // If wallet-ui is connected but wallet-adapter is not, try to connect wallet-adapter
    if (walletUiConnected && account?.address && !walletAdapterConnected) {
      console.log('⚠️ wallet-ui is connected but wallet-adapter is not!');
      console.log('   Attempting to connect wallet-adapter...');
      
      // Try to connect wallet-adapter
      if (walletAdapterWallet) {
        connect().catch((err) => {
          console.error('❌ Failed to auto-connect wallet-adapter:', err);
        });
      }
    }

    // If addresses don't match, something is wrong
    if (walletUiConnected && walletAdapterConnected) {
      const walletUiAddr = account?.address;
      const walletAdapterAddr = walletAdapterPublicKey?.toBase58();
      
      if (walletUiAddr !== walletAdapterAddr) {
        console.warn('⚠️ Wallet addresses don\'t match!');
        console.warn('  wallet-ui:', walletUiAddr);
        console.warn('  wallet-adapter:', walletAdapterAddr);
      } else {
        console.log('✅ Both wallet systems connected to:', walletUiAddr);
      }
    }
  }, [
    walletUiConnected, 
    account?.address, 
    walletAdapterConnected, 
    walletAdapterPublicKey,
    walletAdapterWallet,
    connect
  ]);

  return null; // This is a logic-only component
}
