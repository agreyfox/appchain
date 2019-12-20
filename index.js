const path = require('path');
const fs = require('fs');
chain3 = require('chain3')
chain3 = require('chain3');
solc = require('solc');

chain3 = new chain3();
chain3.setProvider(new chain3.providers.HttpProvider('http://localhost:8545'));
solfile = './st/v2/VnodeProtocolBase.sol';
contract = fs.readFileSync(solfile, 'utf8');

output = solc.compile(contract, 1);
abi = output.contracts[':VnodeProtocolBase'].interface;
bin = output.contracts[':VnodeProtocolBase'].bytecode;

VnodeProtocolBaseContract = chain3.mc.contract(JSON.parse(abi));
chain3.personal.unlockAccount(chain3.mc.accounts[0], 'qweasdzxc');
VnodeProtocolBase = VnodeProtocolBaseContract.new(2, { from: chain3.mc.accounts[0], data: '0x' + bin, gas: '5000000' });
chain3.mc.getTransactionReceipt(VnodeProtocolBase.transactionHash).contractAddress;
