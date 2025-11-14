import * as readline from "readline/promises";
import { WalletBuilder } from "@midnight-ntwrk/wallet";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import {
    NetworkId,
    setNetworkId,
    getZswapNetworkId,
    getLedgerNetworkId
} from "@midnight-ntwrk/midnight-js-network-id";
import { createBalancedTx } from "@midnight-ntwrk/midnight-js-types";
import { Transaction } from "@midnight-ntwrk/ledger";
import { Transaction as ZswapTransaction } from "@midnight-ntwrk/zswap";
import { WebSocket } from "ws";
import * as path from "path";
import * as fs from "fs";
import * as Rx from "rxjs";

// Fix WebSocket for Node.js environment
// @ts-ignore
globalThis.WebSocket = WebSocket;

// Configure for Midnight Testnet
setNetworkId(NetworkId.TestNet);

// Testnet connection endpoints
const TESTNET_CONFIG = {
    indexer: "https://indexer.testnet-02.midnight.network/api/v1/graphql",
    indexerWS: "wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws",
    node: "https://rpc.testnet-02.midnight.network",
    proofServer: "http://127.0.0.1:6300"
};

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("Ticketing Demo CLI (Midnight)\n");

    try {
        // Check for deployment file
        if (!fs.existsSync("deployment.json")) {
            console.error("No deployment.json found! Run npm run deploy first.");
            process.exit(1);
        }

        const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf-8"));
        console.log(`Contract: ${deployment.contractAddress}\n`);

        // Get wallet seed
        const walletSeed = await rl.question("Enter your wallet seed: ");

        console.log("\nConnecting to Midnight network...");

        // Build wallet
        const wallet = await WalletBuilder.buildFromSeed(
            TESTNET_CONFIG.indexer,
            TESTNET_CONFIG.indexerWS,
            TESTNET_CONFIG.proofServer,
            TESTNET_CONFIG.node,
            walletSeed,
            getZswapNetworkId(),
            "info"
        );

        wallet.start();

        // Wait for sync
        await Rx.firstValueFrom(
            wallet.state().pipe(Rx.filter((s) => s.syncProgress?.synced === true))
        );

        // Load contract
        const contractPath = path.join(process.cwd(), "contracts");
        const contractModulePath = path.join(
            contractPath,
            "managed",
            "hello-world",
            "contract",
            "index.cjs"
        );
        const HelloWorldModule = await import(contractModulePath);
        const contractInstance = new HelloWorldModule.Contract({});

        // Create wallet provider
        const walletState = await Rx.firstValueFrom(wallet.state());

        const walletProvider = {
            coinPublicKey: walletState.coinPublicKey,
            encryptionPublicKey: walletState.encryptionPublicKey,
            balanceTx(tx: any, newCoins: any) {
                return wallet
                    .balanceTransaction(
                        ZswapTransaction.deserialize(
                            tx.serialize(getLedgerNetworkId()),
                            getZswapNetworkId()
                        ),
                        newCoins
                    )
                    .then((tx) => wallet.proveTransaction(tx))
                    .then((zswapTx) =>
                        Transaction.deserialize(
                            zswapTx.serialize(getZswapNetworkId()),
                            getLedgerNetworkId()
                        )
                    )
                    .then(createBalancedTx);
            },
            submitTx(tx: any) {
                return wallet.submitTransaction(tx);
            }
        };

        // Configure providers
        const zkConfigPath = path.join(contractPath, "managed", "hello-world");
        const providers = {
            privateStateProvider: levelPrivateStateProvider({
                privateStateStoreName: "hello-world-state"
            }),
            publicDataProvider: indexerPublicDataProvider(
                TESTNET_CONFIG.indexer,
                TESTNET_CONFIG.indexerWS
            ),
            zkConfigProvider: new NodeZkConfigProvider(zkConfigPath),
            proofProvider: httpClientProofProvider(TESTNET_CONFIG.proofServer),
            walletProvider: walletProvider,
            midnightProvider: walletProvider
        };

        // Connect to contract
        const deployed: any = await findDeployedContract(providers, {
            contractAddress: deployment.contractAddress,
            contract: contractInstance,
            privateStateId: "helloWorldState",
            initialPrivateState: {}
        });

        console.log("Connected to contract\n");

        // Helper: read current on-chain JSON state from message field (or default)
        async function readOnChainState(): Promise<any> {
            try {
                const state = await providers.publicDataProvider.queryContractState(
                    deployment.contractAddress
                );
                if (state) {
                    const ledger = HelloWorldModule.ledger(state.data);
                    const message = Buffer.from(ledger.message).toString();
                    try {
                        return JSON.parse(message);
                    } catch {
                        return {};
                    }
                }
            } catch { }
            return {};
        }

        async function writeOnChainState(obj: any) {
            const json = JSON.stringify(obj);
            await deployed.callTx.storeMessage(json);
        }

        // Main menu loop
        let running = true;
        while (running) {
            console.log("--- Menu ---");
            console.log("1. Initialize ticket system");
            console.log("2. Issue a ticket");
            console.log("3. Redeem a ticket");
            console.log("4. Show on-chain state");
            console.log("5. Exit");

            const choice = await rl.question("\nYour choice: ");

            switch (choice) {
                case "1": {
                    // Initialize: set maxAge and empty structures
                    console.log("\nInitialize ticket system");
                    const ageHours = await rl.question("Max age in hours (e.g., 24): ");
                    const maxAgeMs = Number(ageHours) * 60 * 60 * 1000;
                    const depthAns = await rl.question("Merkle depth (e.g., 16): ");
                    const depth = Number(depthAns) || 16;
                    const onchain = { version: 1, root: "", maxAgeMs, nullifiers: [], leafCount: 0, depth };
                    await writeOnChainState(onchain);
                    console.log("Initialized on-chain parameters.\n");
                    break;
                }

                case "2": {
                    // Issue a ticket: update local tree and push new root on-chain
                    const { TicketSystem } = await import("./tickets/state.js");
                    let system = TicketSystem.fromLocal();
                    let onchain = await readOnChainState();
                    if (!system) {
                        if (!onchain.depth || !onchain.maxAgeMs) {
                            console.log("Please initialize first (option 1).\n");
                            break;
                        }
                        system = new TicketSystem(onchain.depth, onchain.maxAgeMs);
                    }
                    const rec = system.issueTicket();
                    onchain = await readOnChainState();
                    onchain.root = system.getRoot();
                    onchain.leafCount = system.getLeafCount();
                    await writeOnChainState(onchain);
                    console.log("Issued 1 ticket:");
                    console.log(`  secret: ${rec.secret}`);
                    console.log(`  issuedAt: ${rec.issuedAt}`);
                    console.log(`  index: ${rec.index}`);
                    console.log("Updated on-chain root.\n");
                    break;
                }

                case "3": {
                    // Redeem: user supplies secret and issuedAt; verify against on-chain root and nullifiers
                    const secret = await rl.question("Ticket secret: ");
                    const issuedAtStr = await rl.question("IssuedAt (ms): ");
                    const issuedAt = Number(issuedAtStr);
                    const { TicketSystem, verifyRedemption, nullifierFromSecret } = await import("./tickets/state.js");
                    const system = TicketSystem.fromLocal();
                    if (!system) { console.log("Local ticket data not found. Issue a ticket first.\n"); break; }
                    const rec = system.getRecords().find(r => r.secret === secret && r.issuedAt === issuedAt);
                    if (!rec) { console.log("Ticket not found locally.\n"); break; }
                    const proof = system.generateProof(rec);
                    const onchain = await readOnChainState();
                    const attempt = { secret, issuedAt, proof, nullifier: nullifierFromSecret(secret) } as any;
                    const result = verifyRedemption(onchain, attempt, Date.now());
                    if (!result.ok) { console.log(`Redeem failed: ${result.reason}\n`); break; }
                    // Append nullifier on-chain
                    onchain.nullifiers = onchain.nullifiers || [];
                    onchain.nullifiers.push(attempt.nullifier);
                    await writeOnChainState(onchain);
                    console.log("Redeem success. Nullifier recorded on-chain.\n");
                    break;
                }

                case "4": {
                    const onchain = await readOnChainState();
                    console.log("\nOn-chain state:");
                    console.log(JSON.stringify(onchain, null, 2));
                    console.log("");
                    break;
                }

                case "5":
                    running = false;
                    console.log("\nGoodbye!");
                    break;

                default:
                    console.log("Invalid choice. Please enter 1-5.\n");
            }
        }

        // Clean up
        await wallet.close();
    } catch (error) {
        console.error("\nError:", error);
    } finally {
        rl.close();
    }
}
main().catch(console.error);