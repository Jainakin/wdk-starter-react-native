// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Header from '@/components/header';
import { colors } from '@/constants/colors';
import { useWallet, useWalletManager } from '@tetherto/wdk-react-native-core';
import { QRCode } from '@tetherto/wdk-uikit-react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  RefreshCw,
  Send,
  WalletCards,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

const RGB_LIGHTNING_NETWORK = 'rgb-lightning';
const PENDING_ADDRESS_PREFIX = 'tb1qpendingunlock';

type ActiveMode = 'receive' | 'send';
type ReceiveMode = 'lightning' | 'rgb';

type InfoTileProps = {
  label: string;
  value: string;
};

const envValue = (fallback: string, ...keys: string[]) => {
  const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  return keys.map((key) => env[key]).find(Boolean) ?? fallback;
};

const buildUnlockRequest = () => ({
  bitcoind_rpc_username: envValue(
    'user',
    'EXPO_PUBLIC_RGB_LIGHTNING_BITCOIND_RPC_USERNAME',
    'EXPO_PUBLIC_RGB_BITCOIND_RPC_USERNAME'
  ),
  bitcoind_rpc_password: envValue(
    'password',
    'EXPO_PUBLIC_RGB_LIGHTNING_BITCOIND_RPC_PASSWORD',
    'EXPO_PUBLIC_RGB_BITCOIND_RPC_PASSWORD'
  ),
  bitcoind_rpc_host: envValue(
    '127.0.0.1',
    'EXPO_PUBLIC_RGB_LIGHTNING_BITCOIND_RPC_HOST',
    'EXPO_PUBLIC_RGB_BITCOIND_RPC_HOST'
  ),
  bitcoind_rpc_port: Number(envValue(
    '18443',
    'EXPO_PUBLIC_RGB_LIGHTNING_BITCOIND_RPC_PORT',
    'EXPO_PUBLIC_RGB_BITCOIND_RPC_PORT'
  )),
  indexer_url: envValue(
    'tcp://127.0.0.1:50001',
    'EXPO_PUBLIC_RGB_LIGHTNING_INDEXER_URL',
    'EXPO_PUBLIC_RGB_INDEXER_URL'
  ),
  proxy_endpoint: envValue(
    'rpc://127.0.0.1:3000/json-rpc',
    'EXPO_PUBLIC_RGB_LIGHTNING_PROXY_ENDPOINT',
    'EXPO_PUBLIC_RGB_TRANSPORT_ENDPOINT'
  ),
  announce_addresses: [],
  announce_alias: envValue(
    'wdk-rgb-lightning-demo',
    'EXPO_PUBLIC_RGB_LIGHTNING_ANNOUNCE_ALIAS'
  ),
});

const stringifyResult = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (!value || typeof value !== 'object') return '';

  const record = value as Record<string, unknown>;
  const directValue =
    record.invoice ??
    record.lnInvoice ??
    record.rgbInvoice ??
    record.rgb_invoice ??
    record.rgbinv ??
    record.payment_request ??
    record.hash ??
    record.txid;

  if (directValue) return stringifyResult(directValue);

  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    return item;
  }, 2);
};

const normalizeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const countItems = (value: unknown): string => {
  if (Array.isArray(value)) return String(value.length);
  if (value && typeof value === 'object') return String(Object.keys(value).length);
  return '0';
};

const getObjectValue = (value: unknown, keys: string[]): string | null => {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (item !== undefined && item !== null && item !== '') return stringifyResult(item);
  }

  return null;
};

const InfoTile = ({ label, value }: InfoTileProps) => (
  <View style={styles.infoTile}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
      {value}
    </Text>
  </View>
);

export default function RgbLightningScreen() {
  const insets = useSafeAreaInsets();
  const { wallets, activeWalletId, initializeWallet, isInitializing } = useWalletManager();
  const currentWalletId = activeWalletId || wallets[0]?.identifier;
  const { callAccountMethod, isInitialized } = useWallet(
    currentWalletId ? { walletId: currentWalletId } : undefined
  );
  const unlockPromiseRef = useRef<Promise<boolean> | null>(null);

  const [activeMode, setActiveMode] = useState<ActiveMode>('receive');
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>('lightning');
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0');
  const [nodeInfo, setNodeInfo] = useState<unknown>(null);
  const [networkInfo, setNetworkInfo] = useState<unknown>(null);
  const [channels, setChannels] = useState<unknown[]>([]);
  const [peers, setPeers] = useState<unknown[]>([]);
  const [assets, setAssets] = useState<unknown[]>([]);
  const [lastError, setLastError] = useState('');
  const [invoice, setInvoice] = useState('');
  const [sendResult, setSendResult] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [nodeUnlocked, setNodeUnlocked] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const [lightningAmount, setLightningAmount] = useState('');
  const [rgbAssetId, setRgbAssetId] = useState('');
  const [rgbAssetAmount, setRgbAssetAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendAssetId, setSendAssetId] = useState('');

  const isPendingAddress = useMemo(() => {
    return !address || address.startsWith(PENDING_ADDRESS_PREFIX);
  }, [address]);

  const nodePubkey = useMemo(() => {
    return getObjectValue(nodeInfo, ['pubkey', 'node_pubkey', 'nodeId', 'node_id']) ?? 'Not available';
  }, [nodeInfo]);

  const networkLabel = useMemo(() => {
    return getObjectValue(networkInfo, ['network', 'chain', 'network_id']) ?? 'rgb-lightning';
  }, [networkInfo]);

  const callRgb = useCallback(async <T,>(methodName: string, args?: unknown): Promise<T> => {
    return callAccountMethod<T>(RGB_LIGHTNING_NETWORK, 0, methodName, args);
  }, [callAccountMethod]);

  const unlockRgbNode = useCallback(async () => {
    if (!currentWalletId) return false;
    if (unlockPromiseRef.current) return unlockPromiseRef.current;

    setUnlocking(true);
    const unlockPromise = callRgb('unlock', buildUnlockRequest())
      .then(() => {
        setNodeUnlocked(true);
        return true;
      })
      .catch((error) => {
        const message = normalizeError(error);
        setLastError(message);
        setNodeUnlocked(false);
        return false;
      })
      .finally(() => {
        setUnlocking(false);
        unlockPromiseRef.current = null;
      });

    unlockPromiseRef.current = unlockPromise;
    return unlockPromise;
  }, [callRgb, currentWalletId]);

  const safeCall = useCallback(async <T,>(methodName: string, fallback: T, args?: unknown): Promise<T> => {
    try {
      return await callRgb<T>(methodName, args);
    } catch (error) {
      setLastError(normalizeError(error));
      return fallback;
    }
  }, [callRgb]);

  const loadRgbInfo = useCallback(async () => {
    if (!currentWalletId) return;

    setRefreshing(true);
    setLastError('');

    if (!isInitialized) {
      if (isInitializing) {
        setRefreshing(false);
        return;
      }

      try {
        await initializeWallet({ walletId: currentWalletId });
      } catch (error) {
        setLastError(normalizeError(error));
        setRefreshing(false);
        return;
      }
    }

    const unlocked = await unlockRgbNode();

    if (!unlocked) {
      const fallbackAddress = await safeCall<string>('getAddress', '');
      setAddress(stringifyResult(fallbackAddress));
      setRefreshing(false);
      return;
    }

    const [
      nextAddress,
      nextBalance,
      nextNodeInfo,
      nextNetworkInfo,
      nextChannels,
      nextPeers,
      nextAssets,
    ] = await Promise.all([
      safeCall<string>('getAddress', ''),
      safeCall<string>('getBalance', '0'),
      safeCall<unknown>('getNodeInfo', null),
      safeCall<unknown>('getNetworkInfo', null),
      safeCall<unknown[]>('listChannels', []),
      safeCall<unknown[]>('listPeers', []),
      safeCall<unknown[]>('listAssets', []),
    ]);

    setAddress(stringifyResult(nextAddress));
    setBalance(stringifyResult(nextBalance) || '0');
    setNodeInfo(nextNodeInfo);
    setNetworkInfo(nextNetworkInfo);
    setChannels(Array.isArray(nextChannels) ? nextChannels : []);
    setPeers(Array.isArray(nextPeers) ? nextPeers : []);
    setAssets(Array.isArray(nextAssets) ? nextAssets : []);
    setRefreshing(false);
  }, [
    currentWalletId,
    initializeWallet,
    isInitialized,
    isInitializing,
    safeCall,
    unlockRgbNode,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadRgbInfo();
    }, [loadRgbInfo])
  );

  const handleCopy = useCallback(async (value: string, label: string) => {
    if (!value) return;

    try {
      await Clipboard.setStringAsync(value);
      toast.success(`${label} copied`);
    } catch (error) {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  }, []);

  const handleCreateInvoice = useCallback(async () => {
    setLoadingAction('receive');
    setLastError('');
    setInvoice('');

    try {
      const result = receiveMode === 'lightning'
        ? await callRgb('createLightningInvoice', {
          amountMsat: lightningAmount ? Number(lightningAmount) : undefined,
          expirySec: 3600,
          assetId: rgbAssetId.trim() || undefined,
          assetAmount: rgbAssetAmount ? Number(rgbAssetAmount) : undefined,
        })
        : await callRgb('createRgbInvoice', {
          min_confirmations: 1,
          witness: false,
          asset_id: rgbAssetId.trim() || undefined,
          assignment_kind: 'Fungible',
          assignment_amount: rgbAssetAmount ? Number(rgbAssetAmount) : undefined,
          duration_seconds: 3600,
        });

      setInvoice(stringifyResult(result));
      toast.success('Invoice created');
    } catch (error) {
      const message = normalizeError(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setLoadingAction(null);
    }
  }, [callRgb, lightningAmount, receiveMode, rgbAssetAmount, rgbAssetId]);

  const handleSend = useCallback(async () => {
    if (!recipient.trim()) {
      toast.error('Recipient is required');
      return;
    }
    if (!sendAmount.trim()) {
      toast.error('Amount is required');
      return;
    }

    setLoadingAction('send');
    setLastError('');
    setSendResult('');

    try {
      const result = await callRgb('transfer', {
        recipient: recipient.trim(),
        amount: Number(sendAmount),
        token: sendAssetId.trim() || undefined,
        feeRate: 2,
      });

      setSendResult(stringifyResult(result));
      toast.success('Transfer submitted');
      loadRgbInfo();
    } catch (error) {
      const message = normalizeError(error);
      setLastError(message);
      toast.error(message);
    } finally {
      setLoadingAction(null);
    }
  }, [callRgb, loadRgbInfo, recipient, sendAmount, sendAssetId]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title="RGB Lightning"
        style={{ paddingTop: insets.top + 16 }}
        isLoading={refreshing || unlocking || isInitializing}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadRgbInfo}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.statusPanel}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              <Zap size={22} color={colors.black} />
            </View>
            <View style={styles.statusText}>
              <Text style={styles.title}>RGB Lightning wallet</Text>
              <Text style={styles.subtitle}>
                {unlocking
                  ? 'Unlocking RGB Lightning node'
                  : isInitializing
                    ? 'Unlocking wallet'
                  : nodeUnlocked && !isPendingAddress
                    ? 'Ready to receive'
                    : 'Node address pending unlock'}
              </Text>
            </View>
            <TouchableOpacity style={styles.iconButton} onPress={loadRgbInfo}>
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <RefreshCw size={18} color={colors.primary} />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.addressBlock}>
            <Text style={styles.sectionLabel}>On-chain address</Text>
            <Text style={styles.addressText} numberOfLines={2} ellipsizeMode="middle">
              {isPendingAddress ? 'Address will appear after the RGB Lightning node unlocks.' : address}
            </Text>
            {!isPendingAddress ? (
              <TouchableOpacity
                style={styles.copyAddressButton}
                onPress={() => handleCopy(address, 'Address')}
              >
                <Copy size={16} color={colors.white} />
                <Text style={styles.copyAddressText}>Copy address</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {!isPendingAddress ? (
            <QRCode
              value={address}
              label="RGB Lightning address"
              size={160}
              color={colors.primary}
              containerStyle={styles.qrSection}
            />
          ) : null}
        </View>

        <View style={styles.infoGrid}>
          <InfoTile label="Network" value={networkLabel} />
          <InfoTile label="BTC sats" value={balance} />
          <InfoTile label="Peers" value={countItems(peers)} />
          <InfoTile label="Channels" value={countItems(channels)} />
          <InfoTile label="Assets" value={countItems(assets)} />
          <InfoTile label="Node" value={nodePubkey} />
        </View>

        {lastError ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorTitle}>RGB Lightning status</Text>
            <Text style={styles.errorText}>{lastError}</Text>
          </View>
        ) : null}

        <View style={styles.modeSelector}>
          <TouchableOpacity
            style={[styles.modeButton, activeMode === 'receive' && styles.modeButtonActive]}
            onPress={() => setActiveMode('receive')}
          >
            <ArrowDownLeft size={18} color={activeMode === 'receive' ? colors.black : colors.primary} />
            <Text style={[styles.modeButtonText, activeMode === 'receive' && styles.modeButtonTextActive]}>
              Receive
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, activeMode === 'send' && styles.modeButtonActive]}
            onPress={() => setActiveMode('send')}
          >
            <ArrowUpRight size={18} color={activeMode === 'send' ? colors.black : colors.primary} />
            <Text style={[styles.modeButtonText, activeMode === 'send' && styles.modeButtonTextActive]}>
              Send
            </Text>
          </TouchableOpacity>
        </View>

        {activeMode === 'receive' ? (
          <View style={styles.actionPanel}>
            <View style={styles.formHeader}>
              <WalletCards size={20} color={colors.primary} />
              <Text style={styles.formTitle}>Create invoice</Text>
            </View>

            <View style={styles.smallSelector}>
              <TouchableOpacity
                style={[styles.smallSelectorButton, receiveMode === 'lightning' && styles.smallSelectorActive]}
                onPress={() => setReceiveMode('lightning')}
              >
                <Text style={[
                  styles.smallSelectorText,
                  receiveMode === 'lightning' && styles.smallSelectorTextActive,
                ]}>
                  Lightning
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallSelectorButton, receiveMode === 'rgb' && styles.smallSelectorActive]}
                onPress={() => setReceiveMode('rgb')}
              >
                <Text style={[
                  styles.smallSelectorText,
                  receiveMode === 'rgb' && styles.smallSelectorTextActive,
                ]}>
                  RGB asset
                </Text>
              </TouchableOpacity>
            </View>

            {receiveMode === 'lightning' ? (
              <TextInput
                style={styles.input}
                placeholder="Amount in msats (optional)"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                value={lightningAmount}
                onChangeText={setLightningAmount}
              />
            ) : null}

            <TextInput
              style={styles.input}
              placeholder="Asset ID (optional)"
              placeholderTextColor={colors.textTertiary}
              value={rgbAssetId}
              onChangeText={setRgbAssetId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder={receiveMode === 'lightning' ? 'Asset amount (optional)' : 'Asset amount'}
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              value={rgbAssetAmount}
              onChangeText={setRgbAssetAmount}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleCreateInvoice}
              disabled={loadingAction === 'receive'}
            >
              {loadingAction === 'receive' ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <Copy size={18} color={colors.black} />
              )}
              <Text style={styles.primaryButtonText}>Create receive invoice</Text>
            </TouchableOpacity>

            {invoice ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Invoice</Text>
                <Text style={styles.resultText}>{invoice}</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => handleCopy(invoice, 'Invoice')}>
                  <Copy size={16} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Copy invoice</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.actionPanel}>
            <View style={styles.formHeader}>
              <Send size={20} color={colors.primary} />
              <Text style={styles.formTitle}>Send payment or asset</Text>
            </View>

            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="BOLT11 invoice, RGB invoice, node pubkey, or BTC address"
              placeholderTextColor={colors.textTertiary}
              value={recipient}
              onChangeText={setRecipient}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Amount (msats, sats, or asset units)"
              placeholderTextColor={colors.textTertiary}
              keyboardType="numeric"
              value={sendAmount}
              onChangeText={setSendAmount}
            />

            <TextInput
              style={styles.input}
              placeholder="Asset ID (optional)"
              placeholderTextColor={colors.textTertiary}
              value={sendAssetId}
              onChangeText={setSendAssetId}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.helperText}>
              Lightning sends use msats, on-chain BTC sends use sats, and RGB sends use asset units.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSend}
              disabled={loadingAction === 'send'}
            >
              {loadingAction === 'send' ? (
                <ActivityIndicator size="small" color={colors.black} />
              ) : (
                <Send size={18} color={colors.black} />
              )}
              <Text style={styles.primaryButtonText}>Send</Text>
            </TouchableOpacity>

            {sendResult ? (
              <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>Result</Text>
                <Text style={styles.resultText}>{sendResult}</Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  statusPanel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    marginRight: 12,
  },
  statusText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardDark,
  },
  addressBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  addressText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  copyAddressButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardDark,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  copyAddressText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  qrSection: {
    marginTop: 18,
    alignSelf: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 10,
  },
  infoTile: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 12,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 6,
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  errorPanel: {
    backgroundColor: colors.warningBackground,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 8,
  },
  modeButtonTextActive: {
    color: colors.black,
  },
  actionPanel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  formTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 8,
  },
  smallSelector: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 4,
    marginBottom: 12,
  },
  smallSelectorButton: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallSelectorActive: {
    backgroundColor: colors.cardDark,
  },
  smallSelectorText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  smallSelectorTextActive: {
    color: colors.text,
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.background,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  primaryButton: {
    height: 50,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryButtonText: {
    color: colors.black,
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 8,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 8,
  },
  resultBox: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
    paddingTop: 16,
  },
  resultLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  resultText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
