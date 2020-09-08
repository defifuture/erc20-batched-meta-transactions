// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "./Context.sol";
import "./IERC20.sol";
import "./SafeMath.sol";
import "./Address.sol";

/**
 * @dev Implementation of the {IERC20} interface + batched meta transactions.
 *
 * TIP: For a detailed writeup see our guide
 * https://forum.zeppelin.solutions/t/how-to-implement-erc20-supply-mechanisms/226[How
 * to implement supply mechanisms].
 *
 * We have followed general OpenZeppelin guidelines: functions revert instead
 * of returning `false` on failure. This behavior is nonetheless conventional
 * and does not conflict with the expectations of ERC20 applications.
 *
 * Additionally, an {Approval} event is emitted on calls to {transferFrom}.
 * This allows applications to reconstruct the allowance for all accounts just
 * by listening to said events. Other implementations of the EIP may not emit
 * these events, as it isn't required by the specification.
 *
 * Finally, the non-standard {decreaseAllowance} and {increaseAllowance}
 * functions have been added to mitigate the well-known issues around setting
 * allowances. See {IERC20-approve}.
 */
contract ERC20MetaBatch is Context, IERC20 {
    using SafeMath for uint256;
    using Address for address;

    mapping (address => uint256) private _balances;

    mapping (address => uint256) private _metaNonces;  // the last meta tx nonce for each sender address

    mapping (address => mapping (address => uint256)) private _allowances;

    uint256 private _totalSupply = 10 * 1000 * 1000;  // 10 million tokens

    string private _name;
    string private _symbol;
    uint8 private _decimals;

    constructor () public {
        _name = "Meta Tx Token";
        _symbol = "MTT";
        _decimals = 18;

        _balances[msg.sender] = _totalSupply;  // give all tokens to the smart contract deployer
    }

    // META BATCHING METHODS

    /**
     * @dev Check the (meta tx) nonce of the specified address.
     */
    function nonceOf(address account) public view returns (uint256) {
        return _metaNonces[account];
    }

    /**
     * @dev Process meta txs batch
     */
    function transferMetaBatch(address[] memory senders,
                               address[] memory recipients,
                               uint256[] memory amounts,
                               uint256[] memory relayer_fees,
                               uint256[] memory nonces,
                               bytes32[] memory hashes,
                               uint8[] memory sigV,
                               bytes32[] memory sigR,
                               bytes32[] memory sigS) public returns (bool) {

        // loop through all meta txs
        for (uint256 i = 0; i < senders.length; i++) {
            // do not send tokens FROM the 0x0 address
            require(senders[i] != address(0), "ERC20MetaBatch: Transfer from the zero address does not work.");

            // check if the hash is correct
            bytes32 msgHash = keccak256(abi.encode(senders[i], recipients[i], amounts[i], relayer_fees[i], nonces[i]));
            require(hashes[i] == msgHash, "ERC20MetaBatch: Hash does not match.");

            // check if the signature is correct (ecrecover returns the meta tx sender's address)
            // TODO: this part needs work, signature verification is still failing
            bytes memory prefix = "\x19Ethereum Signed Message:\n32";
            //require(senders[i] == ecrecover(keccak256(abi.encodePacked(prefix, hashes[i])), sigV[i], sigR[i], sigS[i]), "ERC20MetaBatch: Signature is not valid.");

            // check if the nonce is bigger than the previous one
            require(nonces[i] > nonceOf(senders[i]), "ERC20MetaBatch: The meta tx nonce is not bigger than the previous one.");

            // set the a new nonce for the sender
            _metaNonces[senders[i]] = nonces[i];

            // call the _metaTokenTransfers function
            _metaTokenTransfers(senders[i], recipients[i], amounts[i], relayer_fees[i]);
        }

        return true;
    }

    // token transfers are separated from the transferMetaBatch function in order to reduce the stack (and avoid the "Stack Too Deep" error)
    function _metaTokenTransfers(address sender, address recipient, uint256 amount, uint256 relayer_fee) internal {
        uint256 totalAmount = amount.add(relayer_fee);

        // subtract the token amount AND the relayer fee from the senders account
        _balances[sender] = _balances[sender].sub(totalAmount, "ERC20MetaBatch: transfer amount exceeds balance.");

        // add tokens to the recipient's account
        _balances[recipient] = _balances[recipient].add(amount);

        // pay relayer fee to the relayer's account
        _balances[msg.sender] = _balances[msg.sender].add(relayer_fee);
    }


    // STANDARD ERC-20 METHODS

    /**
     * @dev Returns the name of the token.
     */
    function name() public view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5,05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view returns (uint8) {
        return _decimals;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view override returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `recipient` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(_msgSender(), recipient, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20};
     *
     * Requirements:
     * - `sender` and `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     * - the caller must have allowance for ``sender``'s tokens of at least
     * `amount`.
     */
    function transferFrom(address sender, address recipient, uint256 amount) public virtual override returns (bool) {
        _transfer(sender, recipient, amount);
        _approve(sender, _msgSender(), _allowances[sender][_msgSender()].sub(amount, "ERC20: transfer amount exceeds allowance"));
        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].add(addedValue));
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public virtual returns (bool) {
        _approve(_msgSender(), spender, _allowances[_msgSender()][spender].sub(subtractedValue, "ERC20: decreased allowance below zero"));
        return true;
    }

    /**
     * @dev Moves tokens `amount` from `sender` to `recipient`.
     *
     * This is internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `sender` cannot be the zero address.
     * - `recipient` cannot be the zero address.
     * - `sender` must have a balance of at least `amount`.
     */
    function _transfer(address sender, address recipient, uint256 amount) internal virtual {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        _balances[sender] = _balances[sender].sub(amount, "ERC20: transfer amount exceeds balance");
        _balances[recipient] = _balances[recipient].add(amount);
        emit Transfer(sender, recipient, amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

}
