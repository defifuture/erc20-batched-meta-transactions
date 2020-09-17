# An ERC-20 extension for batched meta transactions from multiple users

## The problem

By the term "meta transaction" people usually think of a **gasless** transaction, which means that someone else (the relayer) makes an on-chain token transaction for you and pays for it in Ether. In return, you can pay the relayer in tokens (instead of Ether).

The problem with current implementations of meta transactions is that they only allow the relayer to either:

A) Relay **just 1 meta tx in 1 on-chain transaction**. While this allows the meta tx sender to avoid using ETH, it doesn't lower the transaction cost for the sender, because the relayer has to be compensated in tokens in approx. the same (or higher) value as the gas fees for the on-chain transaction.

B) Relay **multiple** meta txs from a **single user** as defined in [EIP-1776](https://github.com/wighawag/singleton-1776-meta-transaction). This helps with reducing the cost per transaction, but it's not a common occurence that a user would want to send multiple txs at once.

## The solution

The solution is to batch **multiple** meta transactions from **various senders** into **one on-chain transaction**.

**Hypothesis:** This would **lower the cost** of a transaction for a common user. (Note: see test results at the end.)

![](img/meta-txs-directly-to-token-smart-contract.png)

### Use cases

There are many potential use cases, but the two most important are:

- cheap transfer of tokens from one address to another
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
                          uint256[] memory nonces,
                          uint256[] memory blocks,
                          uint8[] memory sigV,
                          bytes32[] memory sigR,
                          bytes32[] memory sigS) public returns (bool) {

    // declare some variables before the loop for better gas efficiency
    address sender;
    address recipient;
    uint256 amount;
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 msgHash;
    uint256 i;

    // loop through all meta txs
    for (i = 0; i < senders.length; i++) {
        sender = senders[i];
        recipient = recipients[i];
        amount = amounts[i];

        if(sender == address(0) || recipient == address(0)) {
            continue; // sender or recipient is 0x0 address, skip this meta tx
        }

        // the meta tx should be processed until (including) the specified block number, otherwise it is invalid
        if(block.number > blocks[i]) {
            continue; // if current block number is bigger than the requested number, skip this meta tx
        }

        // check if the new nonce is bigger than the previous one by exactly 1
        if(nonces[i] != nonceOf(sender) + 1) {
            continue; // if nonce is not bigger by exactly 1 than the previous nonce (for the same sender), skip this meta tx
        }

        // check if meta tx sender's balance is big enough
        if(_balances[sender] < (amount + relayerFees[i])) {
            continue; // if sender's balance is less than the amount and the relayer fee, skip this meta tx
        }

        // check if the signature is valid
        msgHash = keccak256(abi.encode(sender, recipient, amount, relayerFees[i], nonces[i], blocks[i], address(this), msg.sender));
        if(sender != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
            continue; // if sig is not valid, skip to the next meta tx
        }

        // set a new nonce for the sender
        _metaNonces[sender] = nonces[i];

        // transfer tokens
        _balances[sender] -= (amount + relayerFees[i]);
        _balances[recipient] += amount;
        _balances[msg.sender] += relayerFees[i];
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

**Each item** in these arrays represents **data from one meta tx**. That's why the correct order in the arrays is very important.

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
bytes memory prefix = "\x19Ethereum Signed Message:\n32";

//...

bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayerFees[i], nonces[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
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
bytes memory prefix = "\x19Ethereum Signed Message:\n32";

bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayerFees[i], nonces[i], address(this), msg.sender));

if(senders[i] != ecrecover(keccak256(abi.encodePacked(prefix, msgHash)), sigV[i], sigR[i], sigS[i])) {
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

The relayer could trick the meta tx sender into adding too big due block number - this means a block by which the meta tx must be processed. The block number could be significantly into the future, for example 10 years into the future. This means that relayer would have 10 years to submit the meta transaction.

**One way** to solve this problem is by adding an upper bound constraint for a block number within the smart contract. For example, we could say that the specified due block number must not be biger than 100'000 blocks from the current one (this is around 17 days in the future if we assume 15 seconds block time).

```solidity
// the meta tx should be processed until (including) the specified block number, otherwise it is invalid
if(block.number > blocks[i] || blocks[i] > (block.number + 100000)) {
    // If current block number is bigger than the requested due block number, skip this meta tx.
    // Also skip if the due block number is too big (bigger than 100'000 blocks in the future).
    continue;
}
```

This addition could open new security implications, so it should be left out of the formal specification of this EIP. But anyone who wishes to implement this EIP should know about this potential constraint, too.

**The other way** is to keep the `processMetaBatch()` function as it is and rather check for the too big due block number **on the relayer level**. In this case, the user could be notified about the problem and could issue a new meta tx with another relayer that would have a much lower due block number (and the same nonce).

## FAQ

### How much is the relayer fee?

The meta tx sender defines how big fee they want to pay to the relayer.

Although more likely the relayer will suggest (maybe even enforce) a certain amount of the relayer fee via the UI (the web3 application).

### How can relayer prevent an invalid meta tx to be relayed?

The relayer can do some meta tx checks in advance, before sending it on-chain.

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

More info here: https://github.com/defifuture/relayer-smart-contract 

## Gas used tests

In order to test the gas efficiency of the `processMetaBatch()` function, I decided to do the following tests:

- **Test #1 (reference point):** This is a normal on-chain token transfer transaction, which serves as a reference point (a score to beat). Gas used per meta transaction must be better than this reference point.
- **Test #2:** A `processMetaBatch()` transaction where relayer, sender and receiver in all meta transactions is the same address (1 sender/relayer/receiver for M meta transactions).
- **Test #3:** A `processMetaBatch()` transaction where relayer and sender are one address, and receiver is another one - in all meta transactions (1 sender/relayer, 1 receiver for M meta transactions).
- **Test #4:** A `processMetaBatch()` transaction where relayer and sender are one address, but receiver is a different address in every meta transaction (1 sender/relayer, M receivers for M meta transactions).
- **Test #5:** A `processMetaBatch()` transaction where relayer is one address, senders are many addresses (different in every meta tx), and receiver is 1 address which the same in every meta tx (1 relayer, M senders, 1 receiver for M meta transactions).
- **Test #6:** A `processMetaBatch()` transaction where relayer is one address, but senders and receivers are a different address (even from each other) in every meta transaction (1 relayer, M senders, M receivers for M meta transactions). This test is **the most important** one for the hypothesis.

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

- 1 meta tx in the batch: 61981/meta tx (total gas: 61981)
- 5 meta txs in the batch: 25173.2/meta tx (total gas: 125866)
- 10 meta txs in the batch: 20574/meta tx (total gas: 205740)
- 50 meta txs in the batch: 16930.2/meta tx (total gas: 846510)
- 100 meta txs in the batch: 16519.72/meta tx (total gas: 1651972)

**Test #3 (1 sender/relayer, 1 receiver for M meta transactions):**

- 1 meta tx in the batch: 85393/meta tx (total gas: 85393)
- 5 meta txs in the batch: 29848.4/meta tx (total gas: 149242)
- 10 meta txs in the batch: 22917.6/meta tx (total gas: 229176)
- 50 meta txs in the batch: 17399.16/meta tx (total gas: 869958)
- 100 meta txs in the batch: 16753.24/meta tx (total gas: 1675324)

**Test #4 (1 sender/relayer, M receivers for M meta transactions):**

- 1 meta tx in the batch: 85393/meta tx (total gas: 85393)
- 5 meta txs in the batch: 45215.6/meta tx (total gas: 226078)
- 10 meta txs in the batch: 40195.2/meta tx (total gas: 401952)
- 50 meta txs in the batch: 36215.16/meta tx (total gas: 1810758)
- 100 meta txs in the batch: 35759.56/meta tx (total gas: 3575956)

**Test #5 (1 relayer, M senders, 1 receiver for M meta transactions):**

- 1 meta tx in the batch: 89581/meta tx (total gas: 89581)
- 5 meta txs in the batch: 49415.6/meta tx (total gas: 247078)
- 10 meta txs in the batch: 44394/meta tx (total gas: 443940)
- 50 meta txs in the batch: 40415.16/meta tx (total gas: 2020758)
- 100 meta txs in the batch: 39960.4/meta tx (total gas: 3996040)

**Test #6 (1 relayer, M senders, M receivers for M meta transactions):**

- 1 meta tx in the batch: 89593/meta tx (total gas: 89593)
- 5 meta txs in the batch: 64775.6/meta tx (total gas: 323878)
- 10 meta txs in the batch: 61671.6/meta tx (total gas: 616716)
- 50 meta txs in the batch: 59227.08/meta tx (total gas: 2961354)
- 100 meta txs in the batch: 58966.48/meta tx (total gas: 5896648)

As you can see, Test #6 (the most important test for this hypothesis) never comes below the reference point. Which means that using normal on-chain token transfers is more gas efficient than using `processMetaBatch()` function in the form in which is coded in this proposal. 

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
                              uint256[] memory nonces,
                              uint8[] memory sigV,
                              bytes32[] memory sigR,
                              bytes32[] memory sigS) public returns (bool) {
        
        address sender;
        address recipient;
        uint256 amount;
        uint256 i;

        // loop through all meta txs
        for (i = 0; i < senders.length; i++) {
            sender = senders[i];
            recipient = recipients[i];
            amount = amounts[i];

            // change the nonce
            _metaNonces[sender] = nonces[i];

            // transfer tokens
            _balances[sender] -= (amount + relayerFees[i]);
            _balances[recipient] += amount;
            _balances[msg.sender] += relayerFees[i];
        }

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
                              uint256[] memory nonces,
                              uint8[] memory sigV,
                              bytes32[] memory sigR,
                              bytes32[] memory sigS) public returns (bool) {
        
        address sender;
        address recipient;
        uint256 amount;
        uint256 i;

        // loop through all meta txs
        for (i = 0; i < senders.length; i++) {
            sender = senders[i];
            recipient = recipients[i];
            amount = amounts[i];

            // transfer tokens
            _balances[sender] -= (amount + relayerFees[i]);
            _balances[recipient] += amount;
            _balances[msg.sender] += relayerFees[i];
        }

        return true;
    }
```

Results (for Test #6 - all validation removed, no meta nonce change, only token transfers):

- 1 meta tx in the batch: 61541/meta tx (total gas: 61541)
- 5 meta txs in the batch: 37262/meta tx (total gas: 186310)
- 10 meta txs in the batch: 34234.5/meta tx (total gas: 342345)
- 50 meta txs in the batch: 31807/meta tx (total gas: 1590350)
- 100 meta txs in the batch: 31511.39/meta tx (total gas: 3151139)

While nonce is an important security feature, it seems that removing it shows **significant** gas reductions.

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

**How has the gas usage improve after doing a new round of tests?**

By absolutely nothing. No impact whatsoever.

## Conclusion

Batched meta transactions (at least in this implementation) **do not reduce gas cost for M-to-M transactions** (many senders - many receivers). Note that this means that all senders and all receivers are unique addresses (no duplicates) and that receivers have not hold any tokens before.

Where we have seen gas reductions were the 1-to-1 (1 sender - 1 receiver), 1-to-M (1 sender, many receivers), and M-to-1 (M senders, 1 receiver) examples. So **batched meta transactions may still make sense for some use cases**, for example, the following:

- 1 sender wanting to send tokens to many receivers (for example a project sending weekly token rewards, like Balancer). But in this case, a solution like [Disperse.app](https://disperse.app/) makes more sense, because there is no need for a separate relayer and also no need to sign each meta tx (because the whole on-chain tx is already signed).
- Many senders sending tokens to 1 receiver (example: a deposit to a lock contract in order to access L2 - if a bridge to L2 is configured this way)

## Feedback

I'm looking forward to your feedback! 🙂 Please share it using GitHub issues or [this Ethereum Magicians topic](https://ethereum-magicians.org/t/batched-meta-transactions-from-multiple-users-is-this-ready-for-an-eip-draft/4613). Thanks!
