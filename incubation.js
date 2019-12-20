/*
Moac app chain library
Written by Gao Ji Hua 2019/11

子链调用库,
1)创建 erc coin
2)获取vnode 合约, 获取scs pool 合约, 
3)将scs 加入 scs pool Add SCSs to Pool
4) Deploy App Chain Contract 
5) RegisterOpen
6) RegisterClose
7) Atomic Swap of Token (AST) 创建erc 20 
8)requestRelease,registerAdd  TODO:subchainbase.registerAdd.getData(20), subchainbase.requestRelease.getData(senderType, index)
  senderType：     1：scs发起请求       2：收益账号发出请求
  index：          scs序号（参考ScsRPCMethod.GetSubChainInfo中scs的列表）
9)Close App chain  data: '0x43d726d6'
10) 原生币 部署,ERC20 交互,充值,提币
*/
/**
 * 准备工作需要准备:
 * 子链操作账号: 
vnode矿池合约地址: 
vnode代理地址:     192.168.10.209:50062
子链矿池合约地址: 
scs0:     确保启动并加入子链矿池
scs1:     确保启动并加入子链矿池
scs monitor:    
 */
Chain3 = require('chain3');
solc = require('solc');
ABIs = require('./mcABIs');

var chain3URL = "http://localhost:8545";
var scsURL = "http://localhost:8548";

var solbase = "./sol";  //sol 存放位置

var NetID = 101; //缺省是用testnet,
var BaseAccount = "0x42ff541de733a175babb9a4f76efeaf78b46ecad";   //vnode 节点主账户
var BaseAccountPassword = "qweasdzxc"; //密码
var VnodePoolAccount = "";  // vnode account onwer for vnode pool 
var VnodeServiceInterface = "http://localhost:50062";  // vnode service api interface

var VnodeBeneficialAccount = "0xa66f32cf93ab13724ee732c2cbd679946be2f8f7";

var SubChainPoolAccount = "";  // subchain owner account
var ScsMonitorAccount = "";
var ScsPoolAccounts = [];

var ContractAddr_VnodePool = "";  //vnode proxy address 
var ContractAddr_SCSPool = "";
var ContractAddr_ERC20 = "";

var Sol_VnodeContract = "VnodeProtocolBase.sol";
var Sol_Erc20Contract = "erc20.sol";
var Sol_SubChainContract = "SubChainProtocolBase.sol";
var Sol_DappPublicContract = "DappBasePublic.sol";
var Sol_DappPrivateContract = "DappBasePrivate.sol";
var Sol_ChainBaseASTContract = "ChainBaseAST.sol";  // 使用子链独立coin;

var BaseVnodeContract;
var BaseSCSContract;
var BaseSubChainContract;
var BaseERC20Contract;

var Contract_VnodePool;
var Contract_ERC20;
var Contract_SCSPool;
var Contract_SubChain;

var minVnodeDeposit = 1;// number of deposit required for the VNODE proxy to register, unit is mc
var minScsDeposit = 10;// SCS must pay more than this in the register function to get into the SCS pool

var microChainDeposit = 10;// The deposit is required for each SCS to join the MicroChain

var minScsRequired = 3; // Min number of SCSs in the MicroChain, recommended 3 or more
//=================================工具============================

//===============Utils Functions===============================================
// utils for the program
// Check if the input address has enough balance for the mc amount
function checkBalance(inaddr, inMcAmt) {
  if (chain3.mc.getBalance(inaddr) / 1e18 >= inMcAmt) {
    return true;
  } else {
    return false;
  }
}

function sendtx(src, tgtaddr, amount, strData) {

  chain3.mc.sendTransaction(
    {
      from: src,
      value: chain3.toSha(amount, 'mc'),
      to: tgtaddr,
      gas: "2000000",
      gasPrice: chain3.mc.gasPrice,
      data: strData
    });

  console.log('sending from:' + src + ' to:' + tgtaddr + ' amount:' + amount + ' with data:' + strData);
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
    if (curblk > preBlk) {
      console.log("Waiting for blocks to confirm the contract... currently in block " + curblk);
      preBlk = curblk;
    } else {
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
    let balance = chain3.mc.getBalance(addr) / 1000000000000000000;
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
    if ((new Date().getTime() - start) > milliseconds) {
      break;
    }
  }
}
//===========================================end of 工具=======================================


//设置网络
var SetNetWork = (url, networkid) => {
  chain3URL = url;
  NetID = networkid;
}

// 设置vnode 的主account
var SetBaseAccount = (acct, pwd) => {
  BaseAccount = acct;
  BaseAccountPassword = pwd;
}

// depoly new erc20 with name ,symbol and number 
var deployERC20 = (coinname, sym, manymany) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  solfile = solbase + '/' + Sol_Erc20Contract;
  contract = fs.readFileSync(solfile, 'utf8');
  output = solc.compile(contract, 1);
  abi = output.contracts[':MMCoin'].interface;
  bin = output.contracts[':MMCoin'].bytecode;
  //console.log(abi);
  erc20Contract = chain3.mc.contract(JSON.parse(abi));
  BaseERC20Contract = erc20Contract; // 保留
  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);

  dtoken = erc20Contract.new(coinname, sym, manymany, { from: BaseAccount, data: '0x' + bin, gas: '9000000' });
  ContractAddr_ERC20 = waitBlock(dtoken.transactionHash);
  Contract_ERC20 = BaseERC20Contract.at(ContractAddr_ERC20);
  return ContractAddr_ERC20;
};

//创建vnode pool
var CreateVnodePool = () => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));

  var minVnodeDeposit = 1;// number of deposit required for the VNODE proxy to register, unit is mc

  contractName = 'VnodeProtocolBase';
  solpath = solbase + '/' + Sol_VnodeContract;

  contract = fs.readFileSync(solpath, 'utf8');

  output = solc.compile(contract, 1);

  abi = output.contracts[':' + contractName].interface;
  bin = output.contracts[':' + contractName].bytecode;

  var vnodeprotocolbaseContract = chain3.mc.contract(JSON.parse(abi));
  BaseVnodeContract = vnodeprotocolbaseContract;

  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);

  var vnodeprotocolbase = vnodeprotocolbaseContract.new(
    minVnodeDeposit,
    {
      from: BaseAccount,
      data: '0x' + bin,
      gas: '8000000'
    }
  );

  console.log("VNODE protocol is being deployed at transaction HASH: " + vnodeprotocolbase.transactionHash);

  //ContractAddr_VnodePool = vnodeprotocolbaseContract.at(vnodePoolAddr);
  ContractAddr_VnodePool = waitBlock(vnodeprotocolbase.transactionHash);
  Contract_VnodePool = BaseVnodeContract.at(ContractAddr_VnodePool);

  return Contract_VnodePool;
}
// 创建scs pool
var CreateSCSPool = () => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));

  var protocol = "POR";  //貌似不能改
  var minScsDeposit = 10;// SCS must pay more than this in the register function to get into the SCS pool
  var _protocolType = 0; // type of the MicroChain protocol, don't change

  solpath = solbase + '/' + Sol_SubChainContract;
  contractName = 'SubChainProtocolBase';
  contract = fs.readFileSync(solpath, 'utf8');

  output = solc.compile(contract, 1);

  abi = output.contracts[':' + contractName].interface;
  bin = output.contracts[':' + contractName].bytecode;


  var bmin = 3;

  var subchainprotocolbaseContract = chain3.mc.contract(JSON.parse(abi));

  BaseSCSContract = subchainprotocolbaseContract;

  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);

  var subchainprotocolbase = subchainprotocolbaseContract.new(
    protocol,
    minScsDeposit,
    _protocolType,
    {
      from: BaseAccount,
      data: '0x' + bin,
      gas: '8000000'
    }
  );

  console.log("SCS protocol is being deployed at transaction HASH: " + subchainprotocolbase.transactionHash);

  ContractAddr_SCSPool = waitBlock(subchainprotocolbase.transactionHash);
  Contract_SCSPool = BaseSCSContract.at(ContractAddr_SCSPool);

  return Contract_SCSPool;
};

// Deploy the MicroChain contract to form a MicroChain with Atomic Swap of Token (AST) function
var ercRate = 1;       //Exchange rate between ERC20 token and MicroChain native token, must be int large than 1
var min = 1;           //Min SCSs required in the MicroChain, only 1,3,5,7 should be used`
var max = 11;          //Max SCSs needed in the MicroChain, Only 11, 21, 31, 51, 99
var thousandth = 1000; //Fixed, do not need change
var flushRound = 60;   //Number of MotherChain rounds, must between 40 and 500

// these address
// 创建sub chain,传入一个erc20的地址
function deploy_subchainbase() {
  return new Promise((resolve, reject) => {

    console.log("Start to deploy the subchainbase");

    console.log(' subchainbase scsPoolAddr: ', ContractAddr_SCSPool);
    console.log(' vnodePoolAddr: ', ContractAddr_VnodePool);
    console.log(' min: ', min, ' max: ', max, ' thousandth: ', thousandth, ' flushRound: ', flushRound);
    console.log(' erc20Addr: ', ContractAddr_ERC20);
    console.log(' ercRate: ', ercRate);
    console.log(' baseaddr: ', BaseAccount);

    var subchainbase = BaseSubChainContract.new(
      ContractAddr_SCSPool,
      ContractAddr_VnodePool,
      ContractAddr_ERC20,
      ercRate,
      min,
      max,
      thousandth,
      flushRound,
      {
        from: BaseAccount,
        data: '0x' + bin,
        gas: '9000000'
      },
      function (e, contract) {
        if (e != null) { console.log(' subchainbase deploy error : ', e); reject(e); return }
        console.log(' subchainbase Contract address: ', contract.address, ' transactionHash: ', contract.transactionHash);
        if (typeof (contract.address) != 'undefined') { resolve(contract.address); }
      }
    );

  });
}

function registerScsToPool(proto, num) {
  if (num >= minScsDeposit) {
    for (var i = 0; i < ScsPoolAccounts.length; i++) {
      console.log("register scs node:" + ScsPoolAccounts[i], "pool address is " + proto);
      sendtx(BaseAccount, proto, num, '0x4420e486000000000000000000000000' + ScsPoolAccounts[i].substr(2, 100));
    }
  } else {
    console.log("Cannot register SCSs with not enough deposit!", num);
  }

}

//Open the MicroChain register process
function registerOpen(subchainaddr) {
  sendtx(BaseAccount, subchainaddr, '0', '0x5defc56c');
}

//Close the MicroChain register process
function registerClose(subchainaddr) {

  //chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);
  sendtx(BaseAccount, subchainaddr, '0', '0x69f3576f');
}

// must do before flush
function addMicroChainFund(inaddr, num) {
  sendtx(BaseAccount, inaddr, num, '0xa2f09dfa');
}

// vnoderegister(vnode, 1, "127.0.0.1:50062")
// vnodeprotocolbase.vnodeCount()
// vnode - vnode contract object with register function, and address
// num - deposit for VNODE to join the VNODE pool
// data - VNODE register FUNCTION
function vnoderegister(vnode, num, ip) {
  var data = vnode.register.getData(vnode.address, ip);
  console.log("Registering VNODE ......");
  sendtx(BaseAccount, vnode.address, num, data)
}


// 获得contrace base;
var getContractBase = (name) => {
  try {
    chain3 = new Chain3();
    chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
    solfile = solbase + '/' + Sol_Erc20Contract;
    contract = fs.readFileSync(solfile, 'utf8');
    output = solc.compile(contract, 1);
    abi = output.contracts[':MMCoin'].interface;
    bin = output.contracts[':MMCoin'].bytecode;
    //console.log(abi);
    BaseERC20Contract = chain3.mc.contract(JSON.parse(abi));

    contractName = 'VnodeProtocolBase';
    solpath = solbase + '/' + Sol_VnodeContract;

    contract = fs.readFileSync(solpath, 'utf8');

    output = solc.compile(contract, 1);

    abi = output.contracts[':' + contractName].interface;
    bin = output.contracts[':' + contractName].bytecode;

    BaseVnodeContract = chain3.mc.contract(JSON.parse(abi));


    solpath = solbase + '/' + Sol_SubChainContract;
    contractName = 'SubChainProtocolBase';
    contract = fs.readFileSync(solpath, 'utf8');

    output = solc.compile(contract, 1);

    abi = output.contracts[':' + contractName].interface;
    bin = output.contracts[':' + contractName].bytecode;

    BaseSCSContract = chain3.mc.contract(JSON.parse(abi));

    contractName = 'SubChainBase';
    // Need to read both contract files to compile
    var input = {
      '': fs.readFileSync(solbase + '/' + Sol_ChainBaseASTContract, 'utf8'),
      'SubChainProtocolBase.sol': fs.readFileSync(solbase + '/' + Sol_SubChainContract, 'utf8')
    };

    output = solc.compile({ sources: input }, 1);

    abi = output.contracts[':' + contractName].interface;
    bin = output.contracts[':' + contractName].bytecode;

    BaseSubChainContract = chain3.mc.contract(JSON.parse(abi));
    //BaseSubChainContract = subchainbaseContract;
  } catch (e) {
    console.log(e);
    return false;
  }
  //PrintAddr();

  return { BaseVnodeContract, BaseSCSContract, BaseSubChainContract };
};

//set SCSPoolAddrs
var SetSCSPoolAddrs = (addrs) => {
  ScsPoolAccounts = addrs;
};

var RegisterMonitor = (urladdr, addr, subcontractaddr) => {
  var subchainbase;
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  // urladdr as 127.0.0.1:2345"
  let data = "";
  if (BaseSubChainContract != null) {
    subchainbase = BaseSubChainContract.at(subcontractaddr);
    data = subchainbase.registerAsMonitor.getData(addr, urladdr);
  } else {
    console.log("需要装载应用链abi");
    return
  }
  try {


    if (urladdr != null) {
      console.log("register monitor %s", urladdr);
      //subchainbase = BaseSubChainContract.at(subcontractaddr);
      //amount = chain3.toSha(1, 'mc');
      //    console.log(subchainbase);
      chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);

      chain3.mc.sendTransaction({
        from: BaseAccount,
        value: chain3.toSha(1, 'mc'),
        to: subcontractaddr,
        gas: "5000000",
        gasPrice: chain3.mc.gasPrice,
        data: data
      });
    }
  } catch (e) {
    console.log(e);
  }
};

//创建subchian 
var CreateSubChain = (ercaddr, vnodepooaddr, scspooladdr, pooladdrs) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));

  var contractName = 'SubChainBase';

  // Need to read both contract files to compile
  var input = {
    '': fs.readFileSync(solbase + '/' + Sol_ChainBaseASTContract, 'utf8'),
    'SubChainProtocolBase.sol': fs.readFileSync(solbase + '/' + Sol_SubChainContract, 'utf8')
  };

  output = solc.compile({ sources: input }, 1);

  abi = output.contracts[':' + contractName].interface;
  bin = output.contracts[':' + contractName].bytecode;

  var subchainbaseContract = chain3.mc.contract(JSON.parse(abi));
  BaseSubChainContract = subchainbaseContract;

  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);
  if (vnodepooaddr != undefined) {
    ContractAddr_VnodePool = vnodepooaddr;
    Contract_VnodePool = BaseVnodeContract.at(ContractAddr_VnodePool);
  }
  if (scspooladdr != undefined) {
    ContractAddr_SCSPool = scspooladdr;
    Contract_SCSPool = BaseSCSContract.at(scspooladdr);
  }
  if (ercaddr != undefined) {
    ContractAddr_ERC20 = ercaddr;
    Contract_ERC20 = BaseERC20Contract.at(ercaddr);
  }
  if (pooladdrs != undefined) {
    SetSCSPoolAddrs(pooladdrs);
  }
  console.log("Vnode:%s,\n SCS : %s, ERC20:%s,\n scs node account: %v", ContractAddr_VnodePool, ContractAddr_SCSPool, ContractAddr_ERC20, ScsPoolAccounts);
  if (ScsPoolAccounts.length == 0) {
    Console.log("必须使用setSCSPooladdrs 添加scs 节点的benificail account");
    return;
  }
  deploy_subchainbase().then(function (data) {
    console.log("ready to finish sub chain job");
    if (data != null || data != undefined) {
      var microChainAddr = data;

      microChain = BaseSubChainContract.at(microChainAddr);
      Contract_SubChain = microChain;
      console.log(" **********  microChain Contract Address: " + microChainAddr);


      //===============Step 3. Use the deployed Contracts to start a MicroChain======



      if (!checkBalance(microChainAddr, microChainDeposit)) {
        // Add balance to microChainAddr for MicroChain running
        console.log("Add funding to microChain!  microChain:", microChain.address);
        addMicroChainFund(microChainAddr, microChainDeposit);
        waitBalance(microChain.address, microChainDeposit);
      }

      if (!checkBalance(VnodeBeneficialAccount, minVnodeDeposit)) {
        // Add balance
        console.log("Add funding to VNODE!");
        sendtx(BaseAccount, VnodeBeneficialAccount, minVnodeDeposit);
        waitBalance(VnodeBeneficialAccount, minVnodeDeposit);
      }

      // Check to make sure all SCSs have enough balance than the min deposit required by 
      // SCS pool
      for (var i = 0; i < ScsPoolAccounts.length; i++) {
        if (!checkBalance(ScsPoolAccounts[i], minScsDeposit)) {
          // Add balance
          console.log("Add funding to SCS node account!");
          sendtx(BaseAccount, ScsPoolAccounts[i], minScsDeposit);
          waitBalance(ScsPoolAccounts[i], minScsDeposit);
        }
      }

      vnoderegister(Contract_VnodePool, minVnodeDeposit, VnodeServiceInterface);

      console.log("Registering SCS to the pool", Contract_SCSPool.address);
      registerScsToPool(Contract_SCSPool.address, minScsDeposit);

      // Check if the SCS pool have enough nodes registered
      while (true) {
        let count = Contract_SCSPool.scsCount();
        if (count >= minScsRequired) {
          console.log("registertopool has enough scs " + count);
          break;
        }
        console.log("Waiting registertopool, current scs count=" + count);
        sleep(5000);
      }

      // Check the blocks
      let startnum = chain3.mc.blockNumber;
      while (true) {
        let number = chain3.mc.blockNumber;
        if (number > startnum + 5) {
          console.log("reached target block number " + number);
          break;
        }
        console.log("Waiting block number, current block number=" + number);
        sleep(8000);
      }


      // Open the register for the SCSs to join the MicroChain
      registerOpen(microChain.address);
      while (true) {
        let count = microChain.nodeCount();
        if (count >= minScsRequired) {
          console.log("registertopool has enough scs " + count);
          break;
        }
        console.log("Waiting registertopool, current scs count=" + count);
        sleep(5000);
      }

      registerClose(microChain.address);
      testSubChainStatus();
    }

  });
};
//在某subchain上发一个sol
var DeployDapp = (solfile, solname, subchainaddr) => {

  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  // contractName = 'VnodeProtocolBase';
  solpath = solbase + '/' + solfile;

  contract = fs.readFileSync(solpath, 'utf8');

  //output = solc.compile(contract, 1);

  //contract = fs.readFileSync(solfile, 'utf8');
  output = solc.compile(contract, 1);
  console.log(output);
  abi = output.contracts[solname].interface;
  bin = output.contracts[solname].bytecode;
  //subchainaddr = '0x1195cd9769692a69220312e95192e0dcb6a4ec09';
  via = VnodeBeneficialAccount;
  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);
  chain3.mc.sendTransaction({
    from: BaseAccount,
    value: 0, to: subchainaddr,
    gas: 0,
    shardingFlag: "0x3",
    data: '0x' + bin,
    nonce: 0,
    via: via,
  });
  //subchain = BaseSubChainContract.at(subchainaddr);

};

// to install devappbase to enable multiple smartcontract
var EnableMultiContractInSubChain = (subchainaddr, total) => {
  //DeployDapp("DappBasePrivate.sol",":DappBase",subchainaddr);

  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  solfile = 'DappBasePrivate.sol';
  solpath = solbase + '/' + solfile;
  contract = fs.readFileSync(solpath, 'utf8');
  output = solc.compile(contract, 1);
  abi = output.contracts[':DappBase'].interface;
  bin = output.contracts[':DappBase'].bytecode;
  // subchainaddr = '0x1195cd9769692a69220312e95192e0dcb6a4ec09';
  via = VnodeBeneficialAccount;
  chain3.personal.unlockAccount(BaseAccount, BaseAccountPassword);
  amount = total // 注意：amount分别对应subchainbase的tokensupply和erc20的totalsupply，细节详见母应用链货币交互章节
    > chain3.mc.sendTransaction({
      from: BaseAccount,
      value: chain3.toSha(amount, 'mc'),
      to: subchainaddr,
      gas: 0,
      shardingFlag: "0x3",
      data: '0x' + bin,
      nonce: 0,
      via: via,
    });
}

var testSubChainStatus = (subchainaddr) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  chain3.setScsProvider(new chain3.providers.HttpProvider(scsURL));

  // List the SCS server ID
  console.log("SCS ID:", chain3.scs.getSCSId());

  // List the microChain running on the SCS server
  mclist = chain3.scs.getMicroChainList();
  console.log("SCS MicroChain List:", mclist);

  subchainbase = BaseSubChainContract.at(subchainaddr);
  subchainbase.getMonitorInfo();
};

var Balance = (subchanaddr) => {

  SubChainBase = BaseSubChainContract.at(subchanaddr);
  ap = SubChainBase.BALANCE();
  return ap;
};

//测试
var TestPara = (par1, par2, par3, par4) => {
  console.log(par1);
  console.log(par2);
  console.log(par3);
};

var PrintAddr = () => {
  console.log("Vnode Pool Addr:", ContractAddr_VnodePool, BaseVnodeContract);
  console.log("SCS Pool Addr:", ContractAddr_SCSPool, BaseSCSContract);
  console.log("ERC20 Addr:", ContractAddr_ERC20, BaseERC20Contract);
};

var getVnodeContract = (addr) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  chain3.setScsProvider(new chain3.providers.HttpProvider(scsURL));

  if (BaseVnodeContract) {
    Contract_VnodePool = BaseVnodeContract.at(addr);
    return Contract_VnodePool;
  } else {
    console.log("user getBaseContract to get all contract abi");
    return null;
  }
}

var getSCSContract = (addr) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  chain3.setScsProvider(new chain3.providers.HttpProvider(scsURL));
  if (BaseSCSContract) {
    Contract_SCSPool = BaseSCSContract.at(addr);
    return Contract_SCSPool;
  } else {
    console.log("user getBaseContract to get all contract abi");
    return null;
  }
}

var getAppChainContract = (addr) => {
  chain3 = new Chain3();
  chain3.setProvider(new chain3.providers.HttpProvider(chain3URL));
  chain3.setScsProvider(new chain3.providers.HttpProvider(scsURL));
  if (BaseVnodeContBaseSubChainContractract) {
    Contract_SubChain = BaseSubChainContract.at(addr);
    return Contract_SubChain;
  } else {
    console.log("user getBaseContract to get all contract abi");
    return null;
  }
};

var isArray = (obj) => {
  return !!obj && obj.constructor === Array;
  /*  if (Array.isArray)
     return Array.isArray(obj); */
};
//一词
var Create = (coinname, coinsym, howmany) => {

};
var getBaseContract = (id) => {
  if (id == "erc") {
    return BaseERC20Contract;
  } else if (id == "vnode") {
    return BaseVnodeContract;
  } else if (id == "scs") {
    return BaseSCSContract;
  } else if (id == "sub") {
    return BaseSubChainContract;
  }
  return null;
};

var SetMonitorAddr = (aa) => {
  ScsMonitorAccount = aa;
};


class Incubation {

  constructor(chain3url, scsurl) {
    this.Chain3URL = chain3url;
    this.chain3 = new Chain3();
    this.chain3.setProvider(
      new this.chain3.providers.HttpProvider(this.Chain3URL)
    );
    this.NetID = 101;  //测试网络
    if (scsurl) {
      this.ScsURL = scsurl;     //'http://localhost:8548'
      this.chain3.setScsProvider(new this.chain3.providers.HttpProvider(this.ScsURL));
      if (!this.chain3.isConnected()) {
        console.log("Chain3 RPC is not connected!");
        return;
      }
    }
    this.scsPools = [];
    this.VnodeBenificialAddr = "0x42ff541de733a175babb9a4f76efeaf78b46ecad";
    this.VnodeServiceURL = "localhost:50062";
    this._mainaccount = "0x42ff541de733a175babb9a4f76efeaf78b46ecad";
    this._password = "qweasdzxc";
    this.ABIs = this.ABIs;


    // Deploy the MicroChain contract to form a MicroChain with Atomic Swap of Token (AST) function
    this.ercRate = 1;       //Exchange rate between ERC20 token and MicroChain native token, must be int large than 1
    this.min = 1;           //Min SCSs required in the MicroChain, only 1,3,5,7 should be used`
    this.max = 11;          //Max SCSs needed in the MicroChain, Only 11, 21, 31, 51, 99
    this.thousandth = 1000; //Fixed, do not need change
    this.flushRound = 60;   //Number of MotherChain rounds, must between 40 and 500
    this.Addr_Vnode = "";
    this.Addr_SCS = "";
    this.Addr_ERC20 = "";
    this.Addr_SubChain = "";
    this.Contract_Vnode = null;
    this.Contract_SCS = null;
    this.Contract_ERC20 = null;
    this.Contract_SubChain = null;
    this.BaseERC20Contract = null;
    this.BaseSCSContract = null;
    this.BaseVnodeContract = null;
    this.BaseSubChainContract = null;
  }
  get ErcRate() {
    return this.ercRate;
  }
  set ErcRate(n) {
    console.log("和erc20汇兑");
    this.ercRate = n;
  }
  get Min() {
    return this.min;
  }
  set Min(n) {
    console.log("最小SCSs数目 ,可以取 1,3,5,7");
    this.min = n;
  }
  get Max() {
    return this.max;
  }
  set Max(n) {
    console.log("最大SCSs数目 ,可以取 11, 21, 31, 51, 99");
    this.max = n;
  }

  get FlushRound() {
    return this.flushRound;
  }
  set FlushRound(n) {
    console.log("子链刷新频率");
    this.flushRound = n;
  }
  set SCSPoolAddrs(abc) {
    console.log("设置scs 节点池");
    if (isArray(abc)) {
      this.scsPools = abc;
    } else {
      console.error("不是数组");
    }
  }
  get SCSPoolAddrs() {
    return this.scsPools;
  }

  setMainAccount(acct, pass) {
    this._mainaccount = acct;
    this._password = pass;
  }
  get MainAccount() {
    return this._mainaccount;
  }
  get MainAccountPassword() {
    return this._password;
  }


  // 获得contrace base;
  getBaseContract(name) {
    try {
      var solfile = solbase + '/' + Sol_Erc20Contract;
      var contract = fs.readFileSync(solfile, 'utf8');
      var output = solc.compile(contract, 1);
      var abi = output.contracts[':MMCoin'].interface;
      var bin = output.contracts[':MMCoin'].bytecode;
      //console.log(abi);
      this.BaseERC20Contract = this.chain3.mc.contract(JSON.parse(abi));


      var contractName = 'VnodeProtocolBase';
      var solpath = solbase + '/' + Sol_VnodeContract;

      contract = fs.readFileSync(solpath, 'utf8');

      output = solc.compile(contract, 1);

      abi = output.contracts[':' + contractName].interface;
      bin = output.contracts[':' + contractName].bytecode;

      this.BaseVnodeContract = this.chain3.mc.contract(JSON.parse(abi));


      solpath = solbase + '/' + Sol_SubChainContract;
      contractName = 'SubChainProtocolBase';
      contract = fs.readFileSync(solpath, 'utf8');

      output = solc.compile(contract, 1);

      abi = output.contracts[':' + contractName].interface;
      bin = output.contracts[':' + contractName].bytecode;

      this.BaseSCSContract = this.chain3.mc.contract(JSON.parse(abi));

      contractName = 'SubChainBase';
      // Need to read both contract files to compile
      var input = {
        '': fs.readFileSync(solbase + '/' + Sol_ChainBaseASTContract, 'utf8'),
        'SubChainProtocolBase.sol': fs.readFileSync(solbase + '/' + Sol_SubChainContract, 'utf8')
      };

      output = solc.compile({ sources: input }, 1);

      abi = output.contracts[':' + contractName].interface;
      bin = output.contracts[':' + contractName].bytecode;

      this.BaseSubChainContract = this.chain3.mc.contract(JSON.parse(abi));
      //BaseSubChainContract = subchainbaseContract;
    } catch (e) {
      console.log(e);
      return false;
    }
    //PrintAddr();
    if (name == "vnode") {
      return this.BaseVnodeContract;
    }
    if (name == "scs") {
      return this.BaseSCSContract;
    }
    if (name == "appchain") {
      return this.BaseSubChainContract;
    }
    return;
  };


  //发送带data的交易到tgaddr,from src
  sendtx(src, tgtaddr, amount, strData) {
    this.chain3.mc.sendTransaction(
      {
        from: src,
        value: this.chain3.toSha(amount, 'mc'),
        to: tgtaddr,
        gas: "2000000",
        gasPrice: this.chain3.mc.gasPrice,
        data: strData
      });
    console.log('sending from:' + src + ' to:' + tgtaddr + ' amount:' + amount + ' with data:' + strData);
  }
  //发送带data的交易到tgaddr,from src
  fillMoneyAndData(me, src, tgtaddr, amount, strData) {
    me.chain3.mc.sendTransaction(
      {
        from: src,
        value: me.chain3.toSha(amount, 'mc'),
        to: tgtaddr,
        gas: "2000000",
        gasPrice: me.chain3.mc.gasPrice,
        data: strData
      });
    console.log('fillmoney from:' + src + ' to:' + tgtaddr + ' amount:' + amount + ' with data:' + strData);
  }

  //等待完成智能合约
  waitBlock(transactionHash) {
    console.log("等待矿工完成任务");
    while (true) {
      let receipt = this.chain3.mc.getTransactionReceipt(transactionHash);
      if (receipt && receipt.contractAddress) {
        console.log("智能合约成功发布在: " + receipt.contractAddress);
        break;
      }
      console.log("块: " + this.chain3.mc.blockNumber + "...");
      this.sleep(50000);
    }
    return this.chain3.mc.getTransactionReceipt(transactionHash).contractAddress;
  }
  //等待钱到帐
  waitBalance(addr, target) {
    while (true) {
      let balance = this.chain3.mc.getBalance(addr) / 1000000000000000000;
      if (balance >= target) {
        console.log("账户%s有墨客%d ", addr, balance);
        break;
      }
      console.log("等待账户充值完成: " + balance);
      this.sleep(5000);
    }
  }
  //等待
  sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
      if ((new Date().getTime() - start) > milliseconds) {
        break;
      }
    }
  }
  //重新设置网络
  setNetWork(url, networkid) {
    this.Chain3URL = url;
    NetID = networkid;
    this.chain3 = new Chain3();
    this.chain3.setProvider(
      new this.chain3.providers.HttpProvider(this.Chain3URL)
    );
  }
  //检查账户
  checkBalance(inaddr, inMcAmt) {
    console.log(inaddr, inMcAmt);
    if (this.chain3.mc.getBalance(inaddr) / 1e18 >= inMcAmt) {
      return true;
    } else {
      return false;
    }
  }

  // depoly new erc20 with name ,symbol and number 
  deployERC20(coinname, sym, manymany) {
    var solfile = solbase + '/' + Sol_Erc20Contract;
    var contract = fs.readFileSync(solfile, 'utf8');
    var output = solc.compile(contract, 1);
    var abi = output.contracts[':MMCoin'].interface;
    var bin = output.contracts[':MMCoin'].bytecode;
    //console.log(abi);
    var erc20Contract = this.chain3.mc.contract(JSON.parse(abi));
    //this.Contract_ERC20 = erc20Contract; // 保留
    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

    var dtoken = erc20Contract.new(coinname, sym, manymany, { from: this.MainAccount, data: '0x' + bin, gas: '9000000' });
    this.Addr_ERC20 = this.waitBlock(dtoken.transactionHash);
    this.Contract_ERC20 = BaseERC20Contract.at(this.Addr_ERC20);
    return;
  }

  //创建vnode pool
  createVnodePool() {

    var minVnodeDeposit = 1;// number of deposit required for the VNODE proxy to register, unit is mc

    var contractName = 'VnodeProtocolBase';
    var solpath = solbase + '/' + Sol_VnodeContract;

    var contract = fs.readFileSync(solpath, 'utf8');

    var output = solc.compile(contract, 1);

    var abi = output.contracts[':' + contractName].interface;
    var bin = output.contracts[':' + contractName].bytecode;

    var vnodeprotocolbaseContract = this.chain3.mc.contract(JSON.parse(abi));
    //BaseVnodeContract = vnodeprotocolbaseContract;
    this.BaseVnodeContract = vnodeprotocolbaseContract;

    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

    var vnodeprotocolbase = vnodeprotocolbaseContract.new(
      minVnodeDeposit,
      {
        from: this.MainAccount,
        data: '0x' + bin,
        gas: '8000000'
      }
    );

    console.log("创建VNODE,交易 HASH: " + vnodeprotocolbase.transactionHash);


    this.Addr_Vnode = this.waitBlock(vnodeprotocolbase.transactionHash);

    this.Contract_Vnode = this.BaseVnodeContract.at(this.Addr_Vnode);

    return this.Contract_Vnode;
  }

  // 创建scs pool
  createSCSPool() {

    var protocol = "POR";  //貌似不能改
    var minScsDeposit = 10;// SCS must pay more than this in the register function to get into the SCS pool
    var _protocolType = 0; // type of the MicroChain protocol, don't change

    var solpath = solbase + '/' + Sol_SubChainContract;
    var contractName = 'SubChainProtocolBase';
    var contract = fs.readFileSync(solpath, 'utf8');

    var output = solc.compile(contract, 1);

    var abi = output.contracts[':' + contractName].interface;
    var bin = output.contracts[':' + contractName].bytecode;


    var bmin = 3;

    var subchainprotocolbaseContract = this.chain3.mc.contract(JSON.parse(abi));

    this.BaseSCSContract = subchainprotocolbaseContract;

    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

    var subchainprotocolbase = subchainprotocolbaseContract.new(
      protocol,
      minScsDeposit,
      _protocolType,
      {
        from: this.MainAccount,
        data: '0x' + bin,
        gas: '8000000'
      }
    );

    console.log("SCS协议通过交易号%s 部署,请等待 ", subchainprotocolbase.transactionHash);

    this.Addr_SCS = this.waitBlock(subchainprotocolbase.transactionHash);
    this.Contract_SCS = this.BaseSCSContract.at(this.Addr_SCS);

    return this.Contract_SCS;
  }



  // these address
  // 创建sub chain,传入一个erc20的地址
  deploy_subchainbase(bin) {
    let me = this;
    return new Promise((resolve, reject) => {

      console.log("Start to deploy the subchainbase");

      console.log(' subchainbase scsPoolAddr: ', this.Addr_SCS);
      console.log(' vnodePoolAddr: ', this.Addr_Vnode);
      console.log(' min: ', this.Min, ' max: ', this.Max, ' thousandth: ', this.thousandth, ' flushRound: ', this.FlushRound);
      console.log(' erc20Addr: ', this.Addr_ERC20);
      console.log(' ercRate: ', this.ErcRate);
      console.log(' baseaddr: ', this.MainAccount);

      var subchainbase = me.BaseSubChainContract.new(
        me.Addr_SCS,
        me.Addr_Vnode,
        me.Addr_ERC20,
        me.ErcRate,
        me.Min,
        me.Max,
        me.thousandth,
        me.FlushRound,
        {
          from: me.MainAccount,
          data: '0x' + bin,
          gas: '9000000'

        },
        function (e, contract) {
          if (e != null) {
            console.log(' 应用链发布失败: ', e); reject(e); return
          }
          console.log('创建应用链交易tx: ', contract.transactionHash);
          if (typeof (contract.address) != 'undefined') {
            console.log('新应用链地址为: ', contract.address);
            resolve(contract.address);
          }
        }
      );

    });
  }

  registerScsToPool(me, proto, num) {

    if (num >= minScsDeposit) {
      for (var i = 0; i < me.SCSPoolAddrs.length; i++) {
        console.log("为scs 节点注入燃油", me.SCSPoolAddrs[i]);
        me.fillMoneyAndData(me, me.MainAccount, proto, num, '0x4420e486000000000000000000000000' + me.SCSPoolAddrs[i].substr(2, 100));
      }
    } else {
      console.log("没有足够的费用!", num);
    }

  }

  //Open the MicroChain register process
  registerOpen(me, subchainaddr) {
    me.chain3.personal.unlockAccount(me.MainAccount, me.MainAccountPassword);
    me.fillMoneyAndData(me, me.MainAccount, subchainaddr, '0', '0x5defc56c');
    console.debug("开放scs节点注册");
  }

  //Close the MicroChain register process
  registerClose(me, subchainaddr) {
    me.chain3.personal.unlockAccount(me.MainAccount, me.MainAccountPassword);

    me.fillMoneyAndData(me, this.MainAccount, subchainaddr, '0', '0x69f3576f');
    console.debug("关闭scs节点注册");
  }
  //注册vnode节点
  vnodeRegister(me, vnode, num, ip) {
    var data = vnode.register.getData(vnode.address, ip);
    console.log("注册VNODE节点 ......address:%s 数据：", vnode.address, data);
    me.fillMoneyAndData(me, me.MainAccount, vnode.address, num, data);
  }

  // must do before flush
  addMicroChainFund(inaddr, num) {
    this.sendtx(this.MainAccount, inaddr, num, '0xa2f09dfa');
    console.debug("vnode节点注资");
  }


  //创建subchian,need getBaseContract first
  createSubChain(ercaddr, vnodepooladdr, scspooladdr, pooladdrs) {
    //this.getBaseContract();  //获得基础contract;
    var contractName = 'SubChainBase';

    // Need to read both contract files to compile
    var input = {
      '': fs.readFileSync(solbase + '/' + Sol_ChainBaseASTContract, 'utf8'),
      'SubChainProtocolBase.sol': fs.readFileSync(solbase + '/' + Sol_SubChainContract, 'utf8')
    };

    var output = solc.compile({ sources: input }, 1);

    var abi = output.contracts[':' + contractName].interface;
    var bin = output.contracts[':' + contractName].bytecode;
    //console.log(bin);

    this.BaseSubChainContract = this.chain3.mc.contract(JSON.parse(abi));

    // var subchainbaseContract = chain3.mc.contract(JSON.parse(abi));

    this.chain3.personal.unlockAccount(this.MainAccount, this.MainAccountPassword);

    if (vnodepooladdr != undefined) {
      this.Addr_Vnode = vnodepooladdr;
      this.Contract_Vnode = this.BaseVnodeContract.at(this.Addr_Vnode);

    }
    if (scspooladdr != undefined) {
      this.Addr_SCS = scspooladdr;
      this.Contract_SCS = this.BaseSCSContract.at(this.Addr_SCS);

    }
    if (ercaddr != undefined) {
      this.Addr_ERC20 = ercaddr;
      this.Contract_ERC20 = this.BaseERC20Contract.at(this.Addr_ERC20);
    }
    if (pooladdrs != undefined) {
      this.SCSPoolAddrs = pooladdrs;
    }

    console.log("Vnode:%s,\n SCS : %s,\n ERC20:%s,\n scs node account: %v", this.Addr_Vnode, this.Addr_SCS, this.Addr_ERC20, this.SCSPoolAddrs);
    if (this.SCSPoolAddrs.length == 0) {
      Console.log("必须先 添加scs节点的main account");
      return;
    }
    let me = this;
    this.deploy_subchainbase(bin).then(function (data) {

      if (data != null || data != undefined) {
        var microChainAddr = data;

        var microChain = me.BaseSubChainContract.at(microChainAddr);

        me.Contract_SubChain = microChain;
        console.log(" ********** 应用链地址: " + microChainAddr);

        //===============Step 3. Use the deployed Contracts to start a MicroChain======


        if (!me.checkBalance(microChainAddr, microChainDeposit)) {
          // Add balance to microChainAddr for MicroChain running
          console.log("需要给应用链加使用费用!  地址:", microChain.address);
          me.addMicroChainFund(microChainAddr, microChainDeposit);
          me.waitBalance(microChain.address, microChainDeposit);
        }

        if (!me.checkBalance(me.VnodeBenificialAddr, minVnodeDeposit)) {
          // Add balance
          console.log("为Vnode节点添加费用!");
          me.sendtx(me.MainAccount, me.VnodeBenificialAddr, minVnodeDeposit);
          me.waitBalance(me.VnodeBenificialAddr, minVnodeDeposit);
        }

        // Check to make sure all SCSs have enough balance than the min deposit required by 
        // SCS pool

        for (var i = 0; i < me.SCSPoolAddrs.length; i++) {
          if (!me.checkBalance(me.SCSPoolAddrs[i], minScsDeposit)) {
            // Add balance
            console.log("给SCS节点提交费用!地址：", me.SCSPoolAddrs[i]);
            me.sendtx(me.MainAccount, me.SCSPoolAddrs[i], minScsDeposit);
            me.waitBalance(me.SCSPoolAddrs[i], minScsDeposit);
          }
        }

        me.vnodeRegister(me, me.Contract_Vnode, minVnodeDeposit, me.VnodeServiceURL);

        console.log(me.Contract_SCS.address);
        me.registerScsToPool(me, me.Addr_SCS, minScsDeposit);

        // Check if the SCS pool have enough nodes registered
        while (true) {
          let count = me.Contract_SCS.scsCount();
          if (count >= minScsRequired) {
            console.log("已有足够的scs节点加入: " + count);
            break;
          }
          console.log("等待scs节点接受任务,当前 scs节点共有:" + count);
          sleep(8000);
        }

        // Check the blocks
        let startnum = me.chain3.mc.blockNumber;
        while (true) {
          let number = me.chain3.mc.blockNumber;
          if (number > startnum + 5) {
            console.log("矿工完成任务 " + number);
            break;
          }
          console.log("等待矿工出现,当前块:" + number);
          me.sleep(8000);
        }


        // Open the register for the SCSs to join the MicroChain
        me.registerOpen(me, microChain.address);
        while (true) {
          let count = microChain.nodeCount();
          if (count >= minScsRequired) {
            console.log("已有足够节点接入应用链:" + count);
            break;
          }
          console.log("等待应用链矿工出现, scs节点数目:" + count);
          me.sleep(5000);
        }

        me.registerClose(me, microChain.address);
        //testSubChainStatus();
        console.log("应用链部署完成:地址:", microChain.address);
      }

    });
  };
}

var MOAC_MicroChain_Libs = {
  chain3: Chain3,
  baseVnodePool: getBaseContract("vnode"),
  baseSCSPool: getBaseContract("scs"),
  baseERC20: getBaseContract("erc"),
  baseSubChain: getBaseContract("sub"),
  createCoin: deployERC20,
  createSCSPool: CreateSCSPool,
  createVnodePool: CreateVnodePool,
  VnodePoolContract: Contract_VnodePool,
  ScsPoolContract: ContractAddr_SCSPool,
  dotest: TestPara,
  createSubChain: CreateSubChain,
  getBaseContract: getContractBase,
  Addr: PrintAddr,
  getBase: getBaseContract,
  testSubChain: testSubChainStatus,
  setMonitorAddr: SetMonitorAddr,
  Balance: Balance,
  RegMonitor: RegisterMonitor,
  DeployDapp: DeployDapp,
  EnableChain: EnableMultiContractInSubChain,
  send: sendtx,
  contract_vnode: getVnodeContract,
  contract_scs: getSCSContract,
  contract_appchain: getAppChainContract,
  vnodeReg: vnoderegister,
  scsReg: registerScsToPool,
  open: registerOpen,
  close: registerClose,
  appChain: Incubation
};

module.exports = MOAC_MicroChain_Libs;

dd = new Incubation("http://127.0.0.1:8545", "http://127.0.0.1:8548");
