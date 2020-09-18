# An ERC-20 extension for batched meta transactions

## Abstract

A meta transaction is a cryptographically signed message that a user sends to a relayer who then makes an on-chain transaction based on the meta transaction data. A relayer effectively pays gas fees in Ether, while an original sender can compensate the relayer in tokens.

This article takes the concept one step further and implements an ERC-20 extension function that can process a batch of meta transactions sent in one on-chain transaction.

The **hypothesis** was that such **batching would lower the transaction cost** (per meta transaction). But as it turns out, a batch of meta transactions sent from many users to many recipients (M-to-M), **has a higher gas cost** (per meta tx) than a normal on-chain token transfer.

Batched meta transactions are **only gas cost-effective for 1-to-**M (1 sender, many recipients) **and M-to-1** (many senders, 1 recipient) use cases.

## The problem

By the term "meta transaction" people usually think of a **gasless** transaction, which means that someone else (the relayer) makes an on-chain token transaction for you and pays for it in Ether. In return, you can pay the relayer in tokens (instead of Ether).

The problem with current implementations of meta transactions is that they only allow the relayer to either:

A) Relay **just 1 meta tx in 1 on-chain transaction**. While this allows the meta tx sender to avoid using ETH, it doesn't lower the transaction cost for the sender, because the relayer has to be compensated in tokens in approx. the same (or higher) value as the gas fees for the on-chain transaction.

B) Relay **multiple** meta txs from a **single user** as defined in [EIP-1776](https://github.com/wighawag/singleton-1776-meta-transaction). This helps with reducing the cost per transaction, but it's not a common occurrence that a user would want to send multiple txs at once.

## The solution (hypothesis)

The solution is to batch **multiple** meta transactions from **many senders** (to many recipients) into **one on-chain transaction**.

This would **lower the cost** of a transaction for a common user (a hypothesis). 

(Note: see the [test results](#gas-used-tests) at the end of the article.)

![](img/meta-txs-directly-to-token-smart-contract.png)

### Use cases

There are many potential use cases, but the two most important are:

- a cheap transfer of tokens from one address to another
- a low-cost bridge between mainnet and L2 solutions like sidechains and rollups (which require an on-chain deposit before you can use them)

## The implementation

The implementation is pretty straightforward. A user sends a meta transaction to a relayer (through relayer's web app, for example). The relayer waits for multiple meta txs to come up in a mempool until the meta tx fees (at least) cover the cost of the on-chain gas fee.

Technically, the implementation means **adding a couple of functions** to the existing **ERC-20** token standard:

- `processMetaBatch()`
- `nonceOf()`

You can see the proof-of-concept implementation in this file: [ERC20MetaBatch.sol](/contracts/ERC20MetaBatch.sol). This is an extended ERC-20 contract with an added meta tx batch transfer capabilities (see function `processMetaBatch()`).

### `processMetaBatch()`

The `processMetaBatch()` function is responsible for receiving and processing a batch of meta transactions that change token balances.

```solidity
function processMetaBatch(address[] memory senders, 
                          address[] memory recipients, 
                          uint256[] memory amounts,
                          uint256[] memory relayerFees,
                          uint256[] memory blocks,
                          uint8[] memory sigV,
                          bytes32[] memory sigR,
                          bytes32[] memory sigS) public returns (bool) {

    address sender;
    uint256 newNonce;
    uint256 relayerFeesSum = 0;
    bytes32 msgHash;
    uint256 i;

    // loop through all meta txs
    for (i = 0; i < senders.length; i++) {
        sender = senders[i];
        newNonce = _metaNonces[sender] + 1;

        if(sender == address(0) || recipients[i] == address(0)) {
            continue; // sender or recipient is 0x0 address, skip this meta tx
        }

        // the meta tx should be processed until (including) the specified block number, otherwise it is invalid
        if(block.number > blocks[i]) {
            continue; // if current block number is bigger than the requested number, skip this meta tx
        }

        // check if meta tx sender's balance is big enough
        if(_balances[sender] < (amounts[i] + relayerFees[i])) {
            continue; // if sender's balance is less than the amount and the relayer fee, skip this meta tx
        }

        // check if the signature is valid
        msgHash = keccak256(abi.encode(sender, recipients[i], amounts[i], relayerFees[i], newNonce, blocks[i], address(this), msg.sender));
        if(sender != ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)), sigV[i], sigR[i], sigS[i])) {
            continue; // if sig is not valid, skip to the next meta tx
        }

        // set a new nonce for the sender
        _metaNonces[sender] = newNonce;

        // transfer tokens
        _balances[sender] -= (amounts[i] + relayerFees[i]);
        _balances[recipients[i]] += amounts[i];
        relayerFeesSum += relayerFees[i];
    }

    _balances[msg.sender] += relayerFeesSum;

    return true;
}
```

As you can see, the `processMetaBatch()` function takes the following parameters:

- an array of sender addresses (meta txs senders, not relayers)
- an array of receiver addresses
- an array of amounts
- an array of relayer fees (relayer is `msg.sender`)
- an array of block numbers (due "date" for meta tx to be processed)
- Three arrays that represent parts of a signature (v, r, s)

**Each item** in these arrays represents **data from one meta tx**. That's why the correct order in the arrays is very important.

If a relayer gets the order wrong, the `processMetaBatch()` function would notice that (when validating a signature), because a hash of the meta tx values would not match the signed hash. A meta transaction with an invalid signature is skipped.

### `nonceOf()`

Nonces are needed due to replay protection (see [Replay attacks](#replay-attacks) under Security Considerations).

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

> The EIP-2612 (`permit()` function) also requires a nonce mapping. At this point, I'm not sure yet if this mapping should be re-used in case a smart contract implements both this EIP and EIP-2612. 
> 
> At first glance, it seems the nonce mapping could be re-used, but this should be thought through for possible security implications.

### What data is needed in a meta transaction?

- sender address (a user who is sending the meta tx)
- receiver address
- token amount to be transferred - uint256
- relayer fee (in tokens) - uint256
- **nonce** (replay protection within the token contract)
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
                          uint256[] memory blocks,
                          uint8[] memory sigV,
                          bytes32[] memory sigR,
                          bytes32[] memory sigS) public returns (bool) {
    //... function code ...
}
```

### The front-end implementation (relayer-side)

The `processMetaBatch()` function is agnostic to how relayers work and are organised.

The function can be used by a network of relayers who coordinate to avoid collisions (meta txs with the same nonce meant for the same token contract). Having a network of relayers makes sense for tokens with lots of traffic.

A relayer would most likely have a website (web3 application) through which a user could submit a meta transaction. Pending meta transactions can be logged in that website's database (and communicated with other relayers to avoid collisions) until the relayer decides to make an on-chain transaction.

Less used dApps might have only one relayer due to low traffic - although if traffic is too low, using `processMetaBatch()` would not make sense because there would be too few transactions to even make a batch (no tx cost savings).

## Security Considerations

Here is a list of potential security issues and how are they addressed in this EIP.

### Forging a meta transaction

The solution against a relayer forging a meta transaction is for a user to sign the meta transaction with their own private key.

The `processMetaBatch()` function then verifies the signature using `ecrecover()`.

### Replay attacks

The `processMetaBatch()` function is secure against two types of a replay attack:

1. A nonce prevents a replay attack where a relayer would send the same meta tx more than once.
2. The current smart contract address (`address(this)`) is included in the meta tx data hash, which prevents a relayer from sending a meta tx to different token smart contracts (see the code below, under Signature validation). 

### Signature validation

Signing a meta transaction and validating the signature is crucial for this whole scheme to work.

The `processMetaBatch()` function validates a meta tx signature, and if it's **invalid**, the meta tx is **skipped** (but the whole on-chain transaction is **not reverted**).

```solidity
bytes32 msgHash = keccak256(abi.encode(sender, recipients[i], amounts[i], relayerFees[i], newNonce, blocks[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)), sigV[i], sigR[i], sigS[i])) {
    continue; // if sig is not valid, skip to the next meta tx in the loop
}
```

Why not reverting the whole on-chain transaction? Because there could be only one problematic meta tx, and the others should not be dropped just because of one rotten apple.

That said, it is expected of relayers to validate meta txs in advance before relaying them. That's why relayers are not entitled to a relayer fee for an invalid meta tx.

### Malicious relayer forcing a user into over-spending

A malicious relayer could delay sending some user's meta transaction until the user would decide to make the token transaction on-chain.

After that, the relayer would relay the delayed meta tx which would mean that the user would have made two token transactions (over-spending).

**Solution:** Each meta transaction should have an "expiry date". This is defined in a form of a block number by which the meta transaction must be relayed on-chain.

```solidity
function processMetaBatch(...
                          uint256[] memory blocks,
                          ...) public returns (bool) {
    
    //...

	// loop through all meta txs
    for (i = 0; i < senders.length; i++) {

        // the meta tx should be processed until (including) the specified block number, otherwise it is invalid
        if(block.number > blocks[i]) {
            continue; // if current block number is bigger than the requested number, skip this meta tx
        }

        //...
```

### Front-running attack

A malicious relayer could scout the Ethereum mempool to steal meta transactions and front-run the original relayer.

**Solution:** The protection that `processMetaBatch()` function uses is that it requires the meta tx sender to add the relayer's Ethereum address as one of the values in the hash (which is then signed).

When the `processMetaBatch()` function generates a hash it includes the `msg.sender` address in it:

```solidity
bytes32 msgHash = keccak256(abi.encode(sender, recipients[i], amounts[i], relayerFees[i], newNonce, blocks[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash)), sigV[i], sigR[i], sigS[i])) {
    continue; // if sig is not valid, skip to the next meta tx in the loop
}
```

If the meta tx was "stolen", the signature check would fail because the `msg.sender` address would not be the same as the intended relayer's address.

### A malicious (or too impatient) user sending a meta tx with the same nonce through multiple relayers at once

A user that is either malicious or just impatient could submit a meta tx with the same nonce (for the same token contract) to various relayers. Only one of them would get the relayer fee (the first one on-chain), while the others would get an invalid meta transaction.

**Solution:** Relayers could **share a list of their pending meta txs** between each other (sort of an info mempool).

The relayers don't have to fear that someone would steal their respective pending transactions, due to the front-running protection (see above).

If relayers see meta transactions from a certain sender address that have the same nonce and are supposed to be relayed to the same token smart contract, they can decide that only the first registered meta tx goes through and others are dropped (or in case meta txs were registered at the same time, the remaining meta tx could be randomly picked).

At a minimum, relayers need to share this meta tx data (in order to detect meta tx collision):

- sender address
- token address
- nonce

### Too big due block number

The relayer could trick the meta tx sender into adding too big due block number - this means a block by which the meta tx must be processed. The block number could be far in the future, for example, 10 years in the future. This means that relayer would have 10 years to submit the meta transaction.

**One way** to solve this problem is by adding an upper bound constraint for a block number within the smart contract. For example, we could say that the specified due block number must not be bigger than 100'000 blocks from the current one (this is around 17 days in the future if we assume 15 seconds block time).

```solidity
// the meta tx should be processed until (including) the specified block number, otherwise it is invalid
if(block.number > blocks[i] || blocks[i] > (block.number + 100000)) {
    // If current block number is bigger than the requested due block number, skip this meta tx.
    // Also skip if the due block number is too big (bigger than 100'000 blocks in the future).
    continue;
}
```

This addition could open new security implications, so it should be left out of the formal specification of this EIP. But anyone who wishes to implement this EIP should know about this potential constraint, too.

**The other way** is to keep the `processMetaBatch()` function as it is and rather check for the too big due block number **on the relayer level**. In this case, the user could be notified about the problem and could issue a new meta tx with another relayer that would have a much lower block parameter (and the same nonce).

## FAQ

### How much is the relayer fee?

The meta tx sender defines how big the fee they want to pay to the relayer.

Although more likely the relayer will suggest (maybe even enforce) a certain amount of the relayer fee via the UI (the web3 application).

### How can relayer prevent an invalid meta tx to be relayed?

The relayer can do some meta tx checks in advance, before sending it on-chain.

- Check if a signature is valid
- Check if a sender or a receiver is a null address (0x0)
- Check if a sender and a receiver are the same address
- Check if some meta tx data is missing

### Does this approach need a new type of a token contract standard, or is it a basic ERC-20 enough?

This approach would need an **extended ERC-20 token standard** (we could call it **ERC20MetaBatch**). 

This means adding a couple of new functions to ERC-20 that would allow relayers to transfer tokens for users under the condition the meta tx signatures (made by original senders) are valid. This way meta tx senders don't need to trust relayers.

### Is it possible to somehow use the existing ERC-20 token contracts?

This might be possible if all relayers make the on-chain transactions via a special "relayer smart contract" (which then sends multiple txs to token smart contracts). 

But this relayer smart contract would need to have a token spending approval from every user (for each token separately), which would need to be done on-chain, or via the `permit()` function.

More info here: https://github.com/defifuture/relayer-smart-contract 

## Gas used tests

In order to test the gas efficiency of the `processMetaBatch()` function, I decided to do the following tests:

- **Test #1 (reference point):** This is a normal on-chain token transfer transaction, which serves as a reference point (a score to beat). The gas used per meta transaction must be better than this reference point.
- **Test #2:** A `processMetaBatch()` transaction where the relayer, sender and receiver in all meta transactions is the same address (1 sender/relayer/receiver for M meta transactions).
- **Test #3:** A `processMetaBatch()` transaction where the relayer and sender are one address, and the receiver is another one - in all meta transactions (1 sender/relayer, 1 receiver for M meta transactions).
- **Test #4:** A `processMetaBatch()` transaction where the relayer and sender are one address, but the receiver is a different address in every meta transaction (1 sender/relayer, M receivers for M meta transactions).
- **Test #5:** A `processMetaBatch()` transaction where the relayer is one address, senders are many addresses (different in every meta tx), and the receiver is 1 address which the same in every meta tx (1 relayer, M senders, 1 receiver for M meta transactions).
- **Test #6:** A `processMetaBatch()` transaction where the relayer is one address, but senders and receivers are a different address (even from each other) in every meta transaction (1 relayer, M senders, M receivers for M meta transactions). This test is **the most important** one for the hypothesis.

All the tests were run with different batch sizes:

- 1 meta tx in the batch
- 5 meta txs in the batch
- 10 meta txs in the batch
- 50 meta txs in the batch
- 100 meta txs in the batch

### Results

**Test #1 (reference point):**

- Gas cost is always around **51000/tx** (score to beat).

**Test #2 (1 sender/relayer/receiver for M meta transactions):**

- 1 meta tx in the batch: 61066/meta tx (total gas: 61066)
- 5 meta txs in the batch: 23431.2/meta tx (total gas: 117156)
- 10 meta txs in the batch: 18729.4/meta tx (total gas: 187294)
- 50 meta txs in the batch: 15001.26/meta tx (total gas: 750063)
- 100 meta txs in the batch: 14572.79/meta tx (total gas: 1457279)

**Test #3 (1 sender/relayer, 1 receiver for M meta transactions):**

- 1 meta tx in the batch: 84466/meta tx (total gas: 84466)
- 5 meta txs in the batch: 28111.2/meta tx (total gas: 140556)
- 10 meta txs in the batch: 21071.8/meta tx (total gas: 210718)
- 50 meta txs in the batch: 15467.58/meta tx (total gas: 773379)
- 100 meta txs in the batch: 14805.83/meta tx (total gas: 1480583)

**Test #4 (1 sender/relayer, M receivers for M meta transactions):**

- 1 meta tx in the batch: 84466/meta tx (total gas: 84466)
- 5 meta txs in the batch: 43471.2/meta tx (total gas: 217356)
- 10 meta txs in the batch: 38347/meta tx (total gas: 383470)
- 50 meta txs in the batch: 34283.1/meta tx (total gas: 1714155)
- 100 meta txs in the batch: 33813.11/meta tx (total gas: 3381311)

**Test #5 (1 relayer, M senders, 1 receiver for M meta transactions):**

- 1 meta tx in the batch: 88666/meta tx (total gas: 88666)
- 5 meta txs in the batch: 47673.6/meta tx (total gas: 238368)
- 10 meta txs in the batch: 42553/meta tx (total gas: 425530)
- 50 meta txs in the batch: 38485.5/meta tx (total gas: 1924275)
- 100 meta txs in the batch: 38025.83/meta tx (total gas: 3802583)

**Test #6 (1 relayer, M senders, M receivers for M meta transactions):**

- 1 meta tx in the batch: 88666/meta tx (total gas: 88666)
- 5 meta txs in the batch: 63031.2/meta tx (total gas: 315156)
- 10 meta txs in the batch: 59833/meta tx (total gas: 598330)
- 50 meta txs in the batch: 57298.86/meta tx (total gas: 2864943)
- 100 meta txs in the batch: 57032.51/meta tx (total gas: 5703251)

As you can see, Test #6 (the most important test for this hypothesis) never comes below the reference point. This means that using normal on-chain token transfers is more gas efficient than using `processMetaBatch()` function in the form in which is coded in this proposal. 

That said, there might be a more efficient way to code it. See additional test runs below for a potential bottleneck.

### Additional test runs for Test #6 to find a bottleneck

Additional test runs (only for Test #6) were performed where the `processMetaBatch()` function was stripped of all validation and did only token transfers (note that the parameters were kept the same, except the `blocks` parameter was removed). 

In the first test run the nonce change is present, while in the second test run it is not. The difference is quite significant.

**1) Only token transfers and meta nonce change**

```solidity
    function processMetaBatch(address[] memory senders,
                              address[] memory recipients,
                              uint256[] memory amounts,
                              uint256[] memory relayerFees,
                              uint8[] memory sigV,
                              bytes32[] memory sigR,
                              bytes32[] memory sigS) public returns (bool) {
        
        address sender;
        uint256 newNonce;
        uint256 relayerFeesSum = 0;
        bytes32 msgHash;
        uint256 i;

        // loop through all meta txs
        for (i = 0; i < senders.length; i++) {
            sender = senders[i];
            newNonce = _metaNonces[sender] + 1;

            // set a new nonce for the sender
            _metaNonces[sender] = newNonce;

            // transfer tokens
            _balances[sender] -= (amounts[i] + relayerFees[i]);
            _balances[recipients[i]] += amounts[i];
            relayerFeesSum += relayerFees[i];
        }

        _balances[msg.sender] += relayerFeesSum;

        return true;
    }
```

Results (for Test #6 - all validation removed, only meta nonce change and token transfers left):

- 1 meta tx in the batch: 81694/meta tx (total gas: 81694)
- 5 meta txs in the batch: 57419.8/meta tx (total gas: 287099)
- 10 meta txs in the batch: 54389.9/meta tx (total gas: 543899)
- 50 meta txs in the batch: 51961.68/meta tx (total gas: 2598084)
- 100 meta txs in the batch: 51664.27/meta tx (total gas: 5166427)

The results slightly improved, but are still above 51000 gas per meta tx.

Let's try to remove the nonce change.

**2) Only token transfers (without meta nonce change)**

```solidity
    function processMetaBatch(address[] memory senders,
                              address[] memory recipients,
                              uint256[] memory amounts,
                              uint256[] memory relayerFees,
                              uint8[] memory sigV,
                              bytes32[] memory sigR,
                              bytes32[] memory sigS) public returns (bool) {
        
        address sender;
        uint256 relayerFeesSum = 0;
        bytes32 msgHash;
        uint256 i;

        // loop through all meta txs
        for (i = 0; i < senders.length; i++) {
            sender = senders[i];

            // transfer tokens
            _balances[sender] -= (amounts[i] + relayerFees[i]);
            _balances[recipients[i]] += amounts[i];
            relayerFeesSum += relayerFees[i];
        }

        _balances[msg.sender] += relayerFeesSum;

        return true;
    }
```

Results (for Test #6 - all validation removed, no meta nonce change, only token transfers):

- 1 meta tx in the batch: 61541/meta tx (total gas: 61541)
- 5 meta txs in the batch: 37262/meta tx (total gas: 186310)
- 10 meta txs in the batch: 34234.5/meta tx (total gas: 342345)
- 50 meta txs in the batch: 31807/meta tx (total gas: 1590350)
- 100 meta txs in the batch: 31511.39/meta tx (total gas: 3151139)

While nonce is an **important security feature**, it seems that removing it shows **significant** gas reductions.

In this case, it might be good to try to change the way nonces are stored. Instead of its own mapping, nonces mapping could be joined with token balances into one mapping.

### Joining the `_balances` mapping and the `_metaNonces` mapping

The original implementation has both the mappings separate:

```solidity
mapping (address => uint256) private _balances;

mapping (address => uint256) private _metaNonces;
```

To see if gas improvements could be made, I have joined both mappings into one:

```solidity
mapping (address => uint256[2]) private _balancesNonces;
```

Accessing balance and nonce for an address then looked like this:

```solidity
uint256 balance = _balancesNonces[account][0];

uint256 nonce = _balancesNonces[account][1];
```

Changing balance/nonce values was pretty straightforward:

```solidity
_balancesNonces[account][0] += amount; // add amount to balance

_balancesNonces[account][1] += 1; // raise nonce by one
```

**How has the gas usage improved after doing a new round of tests?**

By absolutely nothing. No impact whatsoever.

## Conclusion

Batched meta transactions (at least in this implementation) **do not reduce the gas cost for M-to-M transactions** (many senders - many receivers). Note that this means that all senders and all receivers are unique addresses (no duplicates) and that receivers have not held any tokens before.

Where we have seen gas reductions were the 1-to-1 (1 sender - 1 receiver), 1-to-M (1 sender, many receivers), and M-to-1 (M senders, 1 receiver) examples. So **batched meta transactions may still make sense for some use cases**, for example, the following:

- 1 sender wanting to send tokens to many receivers (for example a project sending weekly token rewards, like Balancer). But in this case, a solution like [Disperse.app](https://disperse.app/) makes more sense, because there is no need for a separate relayer and also no need to sign each meta tx (because the whole on-chain tx is already signed).
- Many senders sending tokens to 1 receiver (example: a deposit to a lock contract in order to access L2 - if a bridge to L2 is configured this way).

## Feedback

I'm looking forward to your feedback! 🙂 Please share it using GitHub issues or [this Ethereum Magicians topic](https://ethereum-magicians.org/t/batched-meta-transactions-from-multiple-users-is-this-ready-for-an-eip-draft/4613). Thanks!
