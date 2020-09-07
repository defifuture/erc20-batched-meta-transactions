const ERC20MetaBatch = artifacts.require("ERC20MetaBatch");

contract("ERC20MetaBatch", async accounts => {
    it("should return token name", async () => {
        let instance = await ERC20MetaBatch.deployed();
        let name = await instance.name();
        assert.equal(name, "Meta Tx Token");
    });
});
