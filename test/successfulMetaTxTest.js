const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

function sliceSignature(signature) {
    let r = signature.slice(0, 66);
    let s = "0x" + signature.slice(66, 130);
    let v = "0x" + signature.slice(130, 132);
    v = web3.utils.toDecimal(v);
    v = v + 27;

    return {r, s, v};
}

contract("Successful Meta Transactions", async accounts => {

    it("should return a token name (not a meta tx)", async () => {
        let instance = await ERC20MetaBatch.deployed();
        let name = await instance.name();
        //console.log("Contract name: " + name);
        assert.equal(name, "Meta Tx Token");
    });

    it("should check how much tokens the contract deployer has (not a meta tx)", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let contractDeployer = accounts[0];

        let deployerBalance = await instance.balanceOf(contractDeployer);
        assert.equal(deployerBalance, 10*1000*1000);
    });

    it("should send tokens from one address to another (not a meta tx)", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let sender = accounts[0];
        let receiver = accounts[1];
        
        let amount = 50;
        //console.log("Token amount: " + amount);

        let result = await instance.transfer(receiver, amount);
        // console.log("Gas used for on-chain token transfer: " + result.receipt.gasUsed);

        let balanceReceiver = await instance.balanceOf(receiver);
        assert.equal(balanceReceiver, 50)
    });

    it("should send a meta tx batch - single tx (valid)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // final token receiver

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(accountTwo);
        //console.log(parseInt(lastNonce));

        let newNonce = parseInt(lastNonce) + 1;
        //console.log(newNonce);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee, the nonce and the token contract address
        let valuesEncoded = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                          [accountTwo, accountThree, amount, relayerFee, newNonce, dueBlockNumber, instance.address, accountOne]);
        //console.log("Values encoded: " + valuesEncoded);
        let hash = web3.utils.keccak256(valuesEncoded);
        // console.log("Hash: " + hash);

        // create a signature
        let signature = await web3.eth.sign(hash, accountTwo);
        let sigSlices = sliceSignature(signature);

        // Make sure the second account still has 50 tokens (from the previous test)
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 50);

        // send meta batch tx
        let result = await instance.processMetaBatch([accountTwo],
                                                     [accountThree],
                                                     [amount],
                                                     [relayerFee],
                                                     [dueBlockNumber],
                                                     [sigSlices.v],
                                                     [sigSlices.r],
                                                     [sigSlices.s]);
        // console.log(result);
        // console.log("Gas used for meta batch (single tx): " + result.receipt.gasUsed);

        // Second account should now have 39 tokens (50 - 10 - 1)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 39);

        // third account should have 10 tokens
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 10);
    });

    it("should send a meta tx batch - two meta txs (both valid)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let accountOne = accounts[0];  // relayer
        let accountTwo = accounts[1];  // meta tx sender
        let accountThree = accounts[2];  // meta tx sender
        let accountFour = accounts[3];  // token receiver
        let accountFive = accounts[4];  // token receiver

        // START META TX 1 (accountTwo --> accountFour)
        let amount1 = 8;
        let relayerFee1 = 1;

        let lastNonceAccountTwo = await instance.nonceOf(accountTwo);
        //console.log(parseInt(lastNonceAccountTwo));

        let newNonceAccountTwo = parseInt(lastNonceAccountTwo) + 1;
        //console.log(newNonceAccountTwo);

        // get a current block number
        let currentBlockNumber = await web3.eth.getBlockNumber();
        let dueBlockNumber = currentBlockNumber + 3;

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded1 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountTwo, accountFour, amount1, relayerFee1, newNonceAccountTwo, dueBlockNumber, instance.address, accountOne]);
        //console.log("Values encoded: " + valuesEncoded1);
        let hash1 = web3.utils.keccak256(valuesEncoded1);
        // console.log("Hash: " + hash1);

        // create a signature
        let signature = await web3.eth.sign(hash1, accountTwo);
        let sigSlices = sliceSignature(signature);

        let meta_tx_one = {
            sender: accountTwo,
            receiver: accountFour,
            amount: amount1,
            relayerFee: relayerFee1,
            dueBlock: dueBlockNumber,
            v: sigSlices.v,
            r: sigSlices.r,
            s: sigSlices.s
        }

        // Make sure the second account still has 39 tokens (from the previous test)
        let balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 39);
        // END META TX 1

        // START META TX 2 (accountThree --> accountFive)
        let amount2 = 3;
        let relayerFee2 = 1;

        let lastNonceAccountThree = await instance.nonceOf(accountThree);
        //console.log(parseInt(lastNonceAccountThree));

        let newNonceAccountThree = parseInt(lastNonceAccountThree) + 1;
        //console.log(newNonceAccountThree);

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded2 = web3.eth.abi.encodeParameters(['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address', 'address'], 
                                                           [accountThree, accountFive, amount2, relayerFee2, newNonceAccountThree, dueBlockNumber, instance.address, accountOne]);
        //console.log("Values encoded: " + valuesEncoded2);
        let hash2 = web3.utils.keccak256(valuesEncoded2);
        // console.log("Hash: " + hash2);

        // create a signature
        let signature2 = await web3.eth.sign(hash2, accountThree);
        let sigSlices2 = sliceSignature(signature2);

        let meta_tx_two = {
            sender: accountThree,
            receiver: accountFive,
            amount: amount2,
            relayerFee: relayerFee2,
            dueBlock: dueBlockNumber,
            v: sigSlices2.v,
            r: sigSlices2.r,
            s: sigSlices2.s
        }

        // Make sure the third account still has 10 tokens (from the previous test)
        let balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 10);
        // END META TX 2

        // SEND META TXS BATCH
        let result = await instance.processMetaBatch([meta_tx_one.sender, meta_tx_two.sender],
                                                     [meta_tx_one.receiver, meta_tx_two.receiver],
                                                     [meta_tx_one.amount, meta_tx_two.amount],
                                                     [meta_tx_one.relayerFee, meta_tx_two.relayerFee],
                                                     [meta_tx_one.dueBlock, meta_tx_two.dueBlock],
                                                     [meta_tx_one.v, meta_tx_two.v],
                                                     [meta_tx_one.r, meta_tx_two.r],
                                                     [meta_tx_one.s, meta_tx_two.s]);
        // console.log(result);
        // console.log("Gas used for meta batch (two txs): " + result.receipt.gasUsed);

        // Second account should now have 30 tokens (39 - 9)
        balanceTwo = await instance.balanceOf(accountTwo);
        assert.equal(parseInt(balanceTwo), 30);

        // Third account should now have 6 tokens (10 - 4)
        balanceThree = await instance.balanceOf(accountThree);
        assert.equal(parseInt(balanceThree), 6);

        // Fourth account should now have 8 tokens
        let balanceFour = await instance.balanceOf(accountFour);
        assert.equal(parseInt(balanceFour), 8);

        // Fifth account should now have 3 tokens
        let balanceFive = await instance.balanceOf(accountFive);
        assert.equal(parseInt(balanceFive), 3);
    });

});
