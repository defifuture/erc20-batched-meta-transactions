const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

contract("ERC20MetaBatch", async accounts => {

    it("should return a token name", async () => {
        let instance = await ERC20MetaBatch.deployed();
        let name = await instance.name();
        //console.log("Contract name: " + name);
        assert.equal(name, "Meta Tx Token");
    });

    it("should check how much tokens the contract deployer has", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let contractDeployer = accounts[0];

        let deployerBalance = await instance.balanceOf(contractDeployer);
        assert.equal(deployerBalance, 10*1000*1000);
    });

    it("should send tokens from one address to another", async() => {
        let instance = await ERC20MetaBatch.deployed();
        let sender = accounts[0];
        let receiver = accounts[1];
        
        let amount = 50;
        //console.log("Token amount: " + amount);

        let result = await instance.transfer(receiver, amount);

        let balanceReceiver = await instance.balanceOf(receiver);
        assert.equal(balanceReceiver, 50)
    });

    it("should send a meta tx batch - single tx (valid)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let account_one = accounts[0];  // relayer
        let account_two = accounts[1];  // meta tx sender
        let account_three = accounts[2];  // final token receiver

        let amount = 10;
        let relayerFee = 1;

        let lastNonce = await instance.nonceOf(account_two);
        //console.log(parseInt(lastNonce));

        let newNonce = parseInt(lastNonce) + 1;
        //console.log(newNonce);

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded = web3.eth.abi.encodeParameters(['address','address', 'uint256', 'uint256', 'uint256'], 
                                                          [account_two, account_three, amount, relayerFee, newNonce]);
        //console.log("Values encoded: " + valuesEncoded);
        let hash = web3.utils.keccak256(valuesEncoded);
        // console.log("Hash: " + hash);

        // create a signature
        let signature = await web3.eth.sign(hash, account_two);

        let r = signature.slice(0, 66);
        let s = "0x" + signature.slice(66, 130);
        let v = "0x" + signature.slice(130, 132);
        v = web3.utils.toDecimal(v);
        v = v + 27;

        // Make sure the second account still has 50 tokens (from the previous test)
        let balanceTwo = await instance.balanceOf(account_two);
        assert.equal(parseInt(balanceTwo), 50);

        // send meta batch tx
        let result = await instance.transferMetaBatch([account_two],
                                                      [account_three],
                                                      [amount],
                                                      [relayerFee],
                                                      [newNonce],
                                                      [hash],
                                                      [v],
                                                      [r],
                                                      [s]);
        // console.log(result);

        // Second account should now have 39 tokens (50 - 10 - 1)
        balanceTwo = await instance.balanceOf(account_two);
        assert.equal(parseInt(balanceTwo), 39);

        // third account should have 10 tokens
        let balanceThree = await instance.balanceOf(account_three);
        assert.equal(parseInt(balanceThree), 10);
    });

    it("should send a meta tx batch - multiple meta txs (all valid)", async() => {
        let instance = await ERC20MetaBatch.deployed();

        let account_one = accounts[0];  // relayer
        let account_two = accounts[1];  // meta tx sender
        let account_three = accounts[2];  // meta tx sender
        let account_four = accounts[3];  // token receiver
        let account_five = accounts[4];  // token receiver

        // START META TX 1 (account_two --> account_four)
        let amount1 = 8;
        let relayerFee1 = 1;

        let lastNonceAccountTwo = await instance.nonceOf(account_two);
        //console.log(parseInt(lastNonceAccountTwo));

        let newNonceAccountTwo = parseInt(lastNonceAccountTwo) + 1;
        //console.log(newNonceAccountTwo);

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded1 = web3.eth.abi.encodeParameters(['address','address', 'uint256', 'uint256', 'uint256'], 
                                                           [account_two, account_four, amount1, relayerFee1, newNonceAccountTwo]);
        //console.log("Values encoded: " + valuesEncoded1);
        let hash1 = web3.utils.keccak256(valuesEncoded1);
        // console.log("Hash: " + hash1);

        // create a signature
        let signature = await web3.eth.sign(hash1, account_two);

        let r1 = signature.slice(0, 66);
        let s1 = "0x" + signature.slice(66, 130);
        let v1 = "0x" + signature.slice(130, 132);
        v1 = web3.utils.toDecimal(v1);
        v1 = v1 + 27;

        let meta_tx_one = {
            sender: account_two,
            receiver: account_four,
            amount: amount1,
            relayerFee: relayerFee1,
            nonce: newNonceAccountTwo,
            hash: hash1,
            v: v1,
            r: r1,
            s: s1
        }

        // Make sure the second account still has 39 tokens (from the previous test)
        let balanceTwo = await instance.balanceOf(account_two);
        assert.equal(parseInt(balanceTwo), 39);
        // END META TX 1

        // START META TX 2 (account_three --> account_five)
        let amount2 = 3;
        let relayerFee2 = 1;

        let lastNonceAccountThree = await instance.nonceOf(account_three);
        //console.log(parseInt(lastNonceAccountThree));

        let newNonceAccountThree = parseInt(lastNonceAccountThree) + 1;
        //console.log(newNonceAccountThree);

        // create a hash of both addresses, the token amount, the fee and the nonce
        let valuesEncoded2 = web3.eth.abi.encodeParameters(['address','address', 'uint256', 'uint256', 'uint256'], 
                                                           [account_three, account_five, amount2, relayerFee2, newNonceAccountThree]);
        //console.log("Values encoded: " + valuesEncoded2);
        let hash2 = web3.utils.keccak256(valuesEncoded2);
        // console.log("Hash: " + hash2);

        // create a signature
        let signature2 = await web3.eth.sign(hash2, account_three);

        let r2 = signature2.slice(0, 66);
        let s2 = "0x" + signature2.slice(66, 130);
        let v2 = "0x" + signature2.slice(130, 132);
        v2 = web3.utils.toDecimal(v2);
        v2 += 27;

        let meta_tx_two = {
            sender: account_three,
            receiver: account_five,
            amount: amount2,
            relayerFee: relayerFee2,
            nonce: newNonceAccountThree,
            hash: hash2,
            v: v2,
            r: r2,
            s: s2
        }

        // Make sure the third account still has 10 tokens (from the previous test)
        let balanceThree = await instance.balanceOf(account_three);
        assert.equal(parseInt(balanceThree), 10);
        // END META TX 2

        // SEND META TXS BATCH
        let result = await instance.transferMetaBatch([meta_tx_one.sender, meta_tx_two.sender],
                                                      [meta_tx_one.receiver, meta_tx_two.receiver],
                                                      [meta_tx_one.amount, meta_tx_two.amount],
                                                      [meta_tx_one.relayerFee, meta_tx_two.relayerFee],
                                                      [meta_tx_one.nonce, meta_tx_two.nonce],
                                                      [meta_tx_one.hash, meta_tx_two.hash],
                                                      [meta_tx_one.v, meta_tx_two.v],
                                                      [meta_tx_one.r, meta_tx_two.r],
                                                      [meta_tx_one.s, meta_tx_two.s]);
        // console.log(result);

        // Second account should now have 30 tokens (39 - 9)
        balanceTwo = await instance.balanceOf(account_two);
        assert.equal(parseInt(balanceTwo), 30);

        // Third account should now have 6 tokens (10 - 4)
        balanceThree = await instance.balanceOf(account_three);
        assert.equal(parseInt(balanceThree), 6);

        // Fourth account should now have 8 tokens
        let balanceFour = await instance.balanceOf(account_four);
        assert.equal(parseInt(balanceFour), 8);

        // Fifth account should now have 3 tokens
        let balanceFive = await instance.balanceOf(account_five);
        assert.equal(parseInt(balanceFive), 3);
    });

});
