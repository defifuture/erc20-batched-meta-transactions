# An ERC-20 extension for batching meta transactions from multiple users

## The problem

By the term "meta transaction" people usually think of a **gasless** transaction, which means that someone else (the relayer) makes an on-chain token transaction for you and pays for it in Ether. In return, you can pay the relayer in tokens (instead of Ether).

The problem with current implementations of meta transactions is that they only allow the relayer to either:

A) Relay **just 1 meta tx in 1 on-chain transaction**. While this allows the meta tx sender to avoid using ETH, it doesn't lower the transaction cost for the sender, because the relayer has to be compensated in tokens in approx. the same (or higher) value as the gas fees for the on-chain transaction.

B) Relay **multiple** meta txs from a **single user** as defined in [EIP-1776](https://github.com/wighawag/singleton-1776-meta-transaction). This helps with reducing the cost per transaction, but it's not a common occurence that a user would want to send multiple txs at once.

## The solution

The solution is to batch **multiple** meta transactions from **various senders** into **one on-chain transaction**.

This would **lower the cost** of a meta tx for a common user.

![](img/meta-txs-directly-to-token-smart-contract.png)

## The implementation

The implementation is pretty straightforward. A user sends a meta transaction to a relayer (through relayer's web app, for example). The relayer waits for multiple meta txs to come up in a mempool until the meta tx fees (at least) cover the cost of the on-chain gas fee.

Technically, the implementation means **adding a couple of functions** to the existing **ERC-20** token standard:

- `processMetaBatch()`
- `nonceOf()`

You can see the proof-of-concept implementation in this file: [ERC20MetaBatch.sol](https://github.com/defifuture/batching-meta-transactions/blob/master/contracts/ERC20MetaBatch.sol). This is an extended ERC-20 contract with an added meta tx batch transfer capabilities (see function `processMetaBatch()`).

### `processMetaBatch()`

The `processMetaBatch()` function is responsible for receiving and processing a batch of meta transactions that change token balances.

```solidity
function processMetaBatch(address[] memory senders,
                          address[] memory recipients,
                          uint256[] memory amounts,
                          uint256[] memory relayerFees,
                          uint256[] memory nonces,
                          uint256[] memory blocks,
                          uint8[] memory sigV,
                          bytes32[] memory sigR,
                          bytes32[] memory sigS) public returns (bool) {

    // loop through all meta txs
    for (uint256 i = 0; i < senders.length; i++) {

        // the meta tx should be processed until (including) the specified block number, otherwise it is invalid
        if(block.number > blocks[i]) {
            continue; // if current block number is bigger than the requested number, skip this meta tx
        }

        // check if the new nonce is bigger than the previous one by exactly 1
        if(nonces[i] != nonceOf(senders[i]) + 1) {
            continue; // if nonce is not bigger by exactly 1 than the previous nonce (for the same sender), skip this meta tx
        }

        // check if meta tx sender's balance is big enough
        if(_balances[senders[i]] < (amounts[i] + relayerFees[i])) {
            continue; // if sender's balance is less than the amount and the relayer fee, skip this meta tx
        }

        // check if the signature is valid
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayerFees[i], nonces[i], address(this), msg.sender));
        if(senders[i] != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
            continue; // if sig is not valid, skip to the next meta tx
        }

        // set a new nonce for the sender
        _metaNonces[senders[i]] = nonces[i];

        // token transfer to recipient
        _transfer(senders[i], recipients[i], amounts[i]);

        // pay a fee to the relayer (msg.sender)
        _transfer(senders[i], msg.sender, relayerFees[i]);
    }

    return true;
}
```

As you can see, the `processMetaBatch()` function takes the following parameters:

- an array of sender addresses (meta txs senders, not relayers)
- an array of receiver addresses
- an array of amounts
- an array of relayer fees (relayer is `msg.sender`)
- an array of nonces
- an array of block numbers (due "date" for meta tx to be processed)
- Three arrays that represent parts of a signature (v, r, s)

**Each row** in these arrays represents **data from one meta tx**. That's why the correct order in the arrays is very important.

If a relayer gets the order wrong, the `processMetaBatch()` function would notice that (when validating a signature), because a hash of the meta tx values would not match the signed hash. A meta transaction with an invalid signature is skipped.

### `nonceOf()`

Nonces are needed due to a replay protection (see Replay attacks under Security Considerations).

That's why a mapping between addresses and nonces is required:

```solidity
mapping (address => uint256) private _metaNonces;
```

A (meta) nonce of an address can be checked using this function:

```solidity
function nonceOf(address account) public view returns (uint256) {
    return _metaNonces[account];
}
```

> The EIP-2612 (`permit()` function) also requires a nonce mapping. At this point I'm not sure yet if this mapping should be re-used in case a smart contract implements both this EIP and EIP-2612. 
> 
> On the first glance it seems the nonce mapping could be re-used, but this should be thought through for possible security implications.

### What data is needed in a meta transaction?

- sender address (a user who is sending the meta tx)
- receiver address
- token amount to be transfered - uint256
- relayer fee (in tokens) - uint256
- nonce - uint256 (replay protection within the token contract)
- block number - uint256 (a block by which the meta tx must be processed)
- **token contract address** (replay protection across different token contracts)
- **the relayer address** (front-running protection)
- signature (comes in three parts and it signs a hash of the values above):
  - sigV - uint8
  - sigR - bytes32
  - sigS - bytes32

*(The bolded data is not sent as a parameter, but is still needed to construct a signed hash.)*

### How is the data (about meta txs) sent to the smart contract?

This proof-of-concept is using the approach used by Disperse [here](https://github.com/banteg/disperse-research/blob/master/contracts/Disperse.sol), which means sending each type of meta tx data as a **separate array parameter**.

The crucial part here is that the data in arrays must be in the **correct order**. If the ordering is wrong, the smart contract would notice that (because the signature check would fail) and it would skip that meta transaction.

The `processMetaBatch()` parameters:

```solidity
function processMetaBatch(address[] memory senders, 
                          address[] memory recipients, 
                          uint256[] memory amounts,
                          uint256[] memory relayerFees,
                          uint256[] memory nonces,
                          uint256[] memory blocks,
                          uint8[] memory sigV,
                          bytes32[] memory sigR,
                          bytes32[] memory sigS) public returns (bool) {
    //... function code ...
}
```

### The front-end implementation (relayer-side)

This repository does not show how the implementation should look like on a relayer's side.

But in a nutshell, a relayer can have a website (web3 application) through which a user can submit a meta transaction. Pending meta transactions can be logged in that website's database until the relayer decides to make an on-chain transaction.

## Security Considerations

### Forging a meta transaction

The solution against a relayer forging a meta transaction is for user to sign the meta transaction with their own private key.

The `processMetaBatch()` function then verifies the signature using `ecrecover()`.

### Replay attacks

The `processMetaBatch()` function is secure against two types of a replay attack:

1. A nonce prevents a replay attack where a relayer would send the same meta tx more than once.
2. The current smart contract address (`address(this)`) is included in the meta tx data hash (which is then also signed), which prevents a relayer from sending a meta tx to different token smart contracts (see the code below, under Signature validation). 

### Signature validation

Signing a meta transaction and validating the signature is crucial for this whole scheme to work, because the `msg.sender` is not (necessarily) a meta tx sender.

The `processMetaBatch()` function validates a meta tx signature, and if it's **invalid**, the meta tx is **skipped** (but the whole on-chain transaction is **not reverted**).

```solidity
bytes memory prefix = "\x19Ethereum Signed Message:\n32";

bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayerFees[i], nonces[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
    continue; // if sig is not valid, skip to the next meta tx in the loop
}
```

Why not reverting the whole on-chain transaction? Because there could be only one problematic meta tx and so the others should not be dropped just because of one rotten apple.

That said, it is expected from relayers to validate meta txs in advance before relaying them. That's why relayers are not entitled to a relayer fee for an invalid meta tx.

### Malicious relayer forcing a user into over-spending

A malicious relayer could delay sending user's meta transaction until the user would decide to make the token transaction on-chain.

After that, the relayer would relay the delayed meta tx which would mean that the user would make two token transactions (over-spending).

**Solution:** Each meta transaction should have an expiry date. This is defined by a block number by which the meta transaction must be relayed on-chain.

### Front-running attack

A malicious relayer could scout the Ethereum mempool to steal meta transactions and frontrun the original relayer.

**Solution:** The protection that `processMetaBatch()` function uses is that it requires the meta tx sender to add the relayer's Ethereum address as one of the values in the hash (which is then signed).

When the `processMetaBatch()` function generates a hash it includes the `msg.sender` address in it:

```solidity
bytes memory prefix = "\x19Ethereum Signed Message:\n32";

bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayerFees[i], nonces[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
    continue; // if sig is not valid, skip to the next meta tx in the loop
}
```

If the meta tx was "stolen", the signature check would fail because the `msg.sender` address would not be the same as the intended relayer's address.

### A mailicious (or too impatient) user sending a meta tx with the same nonce through multiple relayers at once

A user that is either malicious or just impatient could submit a meta tx with the same nonce (for the same token contract) to various relayers. Only one of them would get the relayer fee (the first one on-chain), while the others would get an invalid meta transaction.

**Solution:** Relayers could share between each other th information about which meta transactions they have pending (sort of an info mempool).

The relayers don't have to fear that someone would steal their respective pending transactions, due to the front-running protection (see above).

If relayers see meta transactions from a certain sender address that have the same nonce and are supposed to be relayed to the same token smart contract, they can decide that only the first registered meta tx goes through and others are dropped (or in case meta txs were registered at the same time, the remaining meta tx could be randomly picked).

## FAQ

### How much is the relayer fee?

The meta tx sender defines how big fee they want to pay to the relayer.

Although more likely the relayer will suggest (maybe even enforce) a certain amount of the relayer fee via the UI (the web3 application).

### How can relayer prevent an invalid meta tx to be relayed?

The relayer can so some meta tx checks in advance, before sending it on-chain.

- Check if a signature is valid
- Check if a sender or a receiver is a null address (0x0)
- Check if a sender and a receiver are the same address
- Check if some meta tx data is missing

### Does this approach need a new type of a token contract standard, or is a basic ERC-20 enough?

This approach would need a **extended ERC-20 token standard** (we could call it **ERC20MetaBatch**). 

This means adding a couple of new functions to ERC-20 that would allow relayers to transfer tokens for users under the condition the meta tx signatures (made by original senders) are valid. This way meta tx senders don't need to trust relayers.

### Is it possible to somehow use the existing ERC-20 token contracts?

This might be possible if all relayers make the on-chain transactions via a special "relayer smart contract" (which then sends multiple txs to token smart contracts). 

But this relayer smart contract would need to have a token spending approval from every user (for each token separately), which would need to be done on-chain, or via the `permit()` function.
