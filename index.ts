import { Connection, Keypair, SystemProgram, LAMPORTS_PER_SOL, TransactionMessage } from '@solana/web3.js';
import { airdrop } from 'functions';
import * as multisig from "@sqds/multisig";

console.log(multisig.PROGRAM_ADDRESS);
const connection = new Connection("http://localhost:8899", "confirmed");

const createKey = Keypair.generate();
const creator = Keypair.generate();
const secondMember = Keypair.generate();

const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
});
const [programConfigPda] = multisig.getProgramConfigPda({});

const members = [{
        key: creator.publicKey,
        permissions: multisig.types.Permissions.all(),
    },
    {
        key: secondMember.publicKey,
        permissions: multisig.types.Permissions.fromPermissions([multisig.types.Permission.Vote]),
    },
];

const createMultisig = async(members: multisig.types.Member[]) => {
    console.log("programConfigPda : ", programConfigPda.toBase58());

    const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
        connection,
        programConfigPda
    );
    const configTreasury = programConfig.treasury;

    const signature = await multisig.rpc.multisigCreateV2({
        connection,
        treasury: configTreasury,
        createKey,
        creator,
        multisigPda,
        configAuthority: null,
        threshold: 2,
        members,
        timeLock: 0,
        rentCollector: null
    });
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Multisig created: ", signature);
};

const transactionProposal = async() => {

    const [vaultPda, vaultBump] = multisig.getVaultPda({
        multisigPda,
        index: 0,
    });
    await airdrop(connection, vaultPda, LAMPORTS_PER_SOL * 10);

    const instruction = SystemProgram.transfer({
        fromPubkey: vaultPda,
        toPubkey: creator.publicKey,
        lamports: 3 * LAMPORTS_PER_SOL
    });

    const transferMessage = new TransactionMessage({
        payerKey: vaultPda,
        instructions: [instruction],
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash
    });

    const transactionIndex = 1n;
    const signature1 = await multisig.rpc.vaultTransactionCreate({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        creator: creator.publicKey,
        vaultIndex: 0,
        ephemeralSigners: 1,
        transactionMessage: transferMessage,
        memo: "Transfer 0.1 SOL to creator"
    });
    await connection.confirmTransaction(signature1, "confirmed");
    console.log("Transaction created: ", signature1);

    const signature2 = await multisig.rpc.proposalCreate({
        connection,
        feePayer: secondMember,
        multisigPda,
        transactionIndex,
        creator: secondMember
    });
    await connection.confirmTransaction(signature2, "confirmed");
    console.log("Transaction proposal created: ", signature2);
}

const approveTransaction = async() => {
    const transactionIndex = 1n;
    const firstApprove =  await multisig.rpc.proposalApprove({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: creator
    });
    await connection.confirmTransaction(firstApprove, "confirmed");
    console.log("First transaction approve : ", firstApprove);


     const secondApprove = await multisig.rpc.proposalApprove({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: secondMember
    });
    await connection.confirmTransaction(secondApprove, "confirmed");
    console.log("Second transaction approve : ", secondApprove);
}

const executeProposal = async() => {
    const transactionIndex = 1n;
    const [proposalPda] = multisig.getProposalPda({
        multisigPda,
        transactionIndex
    });
    console.log("proposalPda : ", proposalPda.toBase58());

    console.log("creator balance before execution : ", (await connection.getBalance(creator.publicKey, "confirmed")));
    const signature = await multisig.rpc.vaultTransactionExecute({
        connection,
        feePayer: creator,
        multisigPda,
        transactionIndex,
        member: creator.publicKey,
        signers: [creator]
    });
    await connection.confirmTransaction(signature, "confirmed");
    console.log("Transaction executed: ", signature);
    console.log("creator balance after execution : ", (await connection.getBalance(creator.publicKey, "confirmed")));
}

const main = async() => {
    await airdrop(connection, creator.publicKey, 10 * LAMPORTS_PER_SOL);
    await airdrop(connection, secondMember.publicKey, 10 * LAMPORTS_PER_SOL);
    await createMultisig(members);
    await transactionProposal();
    await approveTransaction();
    await executeProposal();
}

main();