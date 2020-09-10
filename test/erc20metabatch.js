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

    it("should send a batch of meta txs", async() => {
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

        // Second account still should now have 39 tokens (50 - 10 - 1)
        balanceTwo = await instance.balanceOf(account_two);
        assert.equal(parseInt(balanceTwo), 39);

        let balanceThree = await instance.balanceOf(account_three);
        assert.equal(parseInt(balanceThree), 10);
    });

});
