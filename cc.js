
const Chain3 = require('chain3');
const fs = require('fs');
const solc = require('solc');//only 0.4.24 version should be used, npm install solc@0.4.24

//===============Setup the Parameters==========================================

// need to have a valid account to use for contracts deployment
baseaddr = "0x42ff541de733a175babb9a4f76efeaf78b46ecad";//keystore address
basepsd = "qweasdzxc";//keystore password




// The VNODE benificial address, should be found in the vnodeconfig.json 
vnodeVia="0xa66f32cf93ab13724ee732c2cbd679946be2f8f7";
vnodeConnectUrl="127.0.0.1:50062";//VNODE connection as parameter to use for VNODE protocol
var minScsRequired = 3; // Min number of SCSs in the MicroChain, recommended 3 or more

//===============Check the Blockchain connection===============================
// 
// Using local node or remote to send TX command
const vnodeUri = 'http://localhost:8545';

let chain3 = new Chain3();
chain3.setProvider(new chain3.providers.HttpProvider(vnodeUri));

if(!chain3.isConnected()){
    throw new Error('unable to connect to moac vnode at ' + vnodeUri);
}else{
    console.log('connected to moac vnode at ' + vnodeUri);
    let balance = chain3.mc.getBalance(baseaddr);
    console.log('Check src account balance:' + baseaddr + ' has ' + balance*1e-18 + " MC");
}

// Min balance of the baseaddr needs to be larger than these numbers if all SCSs need to be funded
// For example, if use 5 SCSs and 1 VNODE, the minimum balance is:
// + SCS deposit (10 mc) * SCS number (=5)
// + VNODE deposit (1 mc) * VNODE number (=1)
// + MicroChain deposit (10 mc)
// = 50 + 1+ 10 = 61
if (!checkBalance(baseaddr, 5) ){
  console.log("Need more balance in baseaddr")
  return;
}else{
  console.log("baseaddr has enough balance!")
}

// Unlock the baseaddr for contract deployment

if (chain3.personal.unlockAccount(baseaddr, basepsd, 0)) {
    console.log(`${baseaddr} is unlocked`);
}else{
    console.log(`unlock failed, ${baseaddr}`);
    throw new Error('unlock failed ' + baseaddr);
}

//===============Step 1. Deploy required Mother Chain contracts=========================
// If you have all these contracts deployed earlier, you can skip this and go to Step 2.
// ERC20
// vnode pool
// scs pool

// Deploy the ERC20 coin with precompiled name as "TEST COIN", supply with 10000000
var basepath = './st/v2';
var contractName = 'erc20';
var solpath = basepath + '/' + contractName + '.sol';

var contract = fs.readFileSync(solpath, 'utf8');
var output = solc.compile(contract, 1);

//Choose the right 
abi = output.contracts[':TestCoin'].interface;
bin = output.contracts[':TestCoin'].bytecode;

// Notice the parameters of this contract is defined in the erc20.sol
// User can change these to other values
// string public name = "Test Coin";
// string public symbol = "TEST";
// uint public decimals = 6;
// uint public INITIAL_SUPPLY = 100000000 * (10 ** decimals);

var testcoinContract = chain3.mc.contract(JSON.parse(abi));

var testcoin = testcoinContract.new(
   {
     from: baseaddr, 
     data: '0x' + bin, 
     gas: '8000000'
   }
 );

console.log("ERC20 is being deployed at transaction HASH: " + testcoin.transactionHash);


//===============Utils Functions===============================================
// utils for the program
// Check if the input address has enough balance for the mc amount
function checkBalance(inaddr, inMcAmt) {
  if ( chain3.mc.getBalance(inaddr)/1e18 >= inMcAmt ){
    return true;
  }else{
    return false;
  }
}

function sendtx(src, tgtaddr, amount, strData) {

  chain3.mc.sendTransaction(
    {
      from: src,
      value:chain3.toSha(amount,'mc'),
      to: tgtaddr,
      gas: "2000000",
      gasPrice: chain3.mc.gasPrice,
      data: strData
    });
    
  console.log('sending from:' +   src + ' to:' + tgtaddr  + ' amount:' + amount + ' with data:' + strData);
}

// wait certain blocks for the contract to be mined
function waitForBlocks(innum) {
  let startBlk = chain3.mc.blockNumber;
  let preBlk = startBlk;
  console.log("Waiting for blocks to confirm the contract... currently in block " + startBlk);
  while (true) {
    let curblk = chain3.mc.blockNumber;
    if (curblk > startBlk + innum) {
      console.log("Waited for " + innum + " blocks!");
      break;
    }
    if ( curblk > preBlk){
      console.log("Waiting for blocks to confirm the contract... currently in block " + curblk);
      preBlk = curblk;
    }else{
        console.log("...");
    }
    
    sleep(2000000);
  }
}

function waitBlock(transactionHash) {
  console.log("Waiting a mined block to include your contract...");
  
  while (true) {
    let receipt = chain3.mc.getTransactionReceipt(transactionHash);
    if (receipt && receipt.contractAddress) {
      console.log("contract has been deployed at " + receipt.contractAddress);
      break;
    }
    console.log("block " + chain3.mc.blockNumber + "...");
    sleep(50000);
  }
  return chain3.mc.getTransactionReceipt(transactionHash).contractAddress;
}

function waitBalance(addr, target) {
    while (true) {
        let balance = chain3.mc.getBalance(addr)/1000000000000000000;
        if (balance >= target) {
          console.log("account has enough balance " + balance);
          break;
        }
        console.log("Waiting the account has enough balance " + balance);
        sleep(5000);
    }
  }

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
      if ((new Date().getTime() - start) > milliseconds){
        break;
      }
    }
}


//===============Utils TX to MicroChains=======================================

function registerScsToPool(proto, num){
  if ( num >= minScsDeposit){
    for( var i = 0;i<scs.length;i++){
      sendtx(baseaddr, proto, num,'0x4420e486000000000000000000000000' + scs[i].substr(2, 100));
    }
  }else{
    console.log("Cannot register SCSs with not enough deposit!", num);
  }

}

//Open the MicroChain register process
function registerOpen(subchainaddr)
{
  sendtx(baseaddr, subchainaddr, '0','0x5defc56c' );
}

//Close the MicroChain register process
function registerClose(subchainaddr)
{
  sendtx(baseaddr, subchainaddr, '0','0x69f3576f' );
}

// must do before flush
function addMicroChainFund(inaddr, num){
  sendtx(baseaddr, inaddr, num,'0xa2f09dfa')
}

// vnoderegister(vnode, 1, "127.0.0.1:50062")
// vnodeprotocolbase.vnodeCount()
// vnode - vnode contract object with register function, and address
// num - deposit for VNODE to join the VNODE pool
// data - VNODE register FUNCTION
function vnoderegister(vnode,num,ip){
  var data=vnode.register.getData(vnode.address,ip)
  console.log("Registering VNODE ......")
  sendtx(baseaddr,vnode.address,num,data)
}


function deploy_subchainbase() {
	return new Promise((resolve, reject) => {
		
		console.log("Start to deploy the subchainbase");
		
		console.log(' subchainbase scsPoolAddr: ', scsPoolAddr, ' vnodePoolAddr: ', vnodePoolAddr, ' min: ', min, ' max: ', max, ' thousandth: ', thousandth, ' flushRound: ', flushRound, ' erc20Addr: ', erc20Addr, ' ercRate: ', ercRate, ' baseaddr: ', baseaddr); 
		
		var subchainbase = subchainbaseContract.new(
		   scsPoolAddr,
		   vnodePoolAddr,
		   erc20Addr,
		   ercRate,
		   min,
		   max,
		   thousandth,
		   flushRound,
		   {
			 from: baseaddr, 
			 data: '0x' + bin,
			 gas: '9000000'
		   }, 
		   function (e, contract){
			   if (e!=null){console.log(' subchainbase deploy error : ', e); reject(e); return}
			   console.log(' subchainbase Contract address: ', contract.address, ' transactionHash: ', contract.transactionHash); 
			   if (typeof(contract.address)!='undefined'){ resolve(contract.address);}		   
		   }
		 );	
		
	})
}

