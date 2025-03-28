import bodyParser from "body-parser";
import express from "express";
const fetch = require("node-fetch");
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  type NodeState = {
    killed: boolean;
    x: 0 | 1 | "?" | null;
    decided: boolean | null;
    k: number | null;
  };
  

  const nodeState: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 0,
  };
  
  const receivedMessages: { [step: number]: Value[] } = {};

  node.get("/status", (req, res) => {
    if (isFaulty) return res.status(500).send("faulty");
    return res.status(200).send("live");
  });

  node.post("/message", (req, res) => {
    const { k, x, messageType } = req.body;
    
    if (isFaulty) {
      nodeState.x = null;
      nodeState.decided = null;
      nodeState.k = null;
      return res.status(500).send("faulty node");
    }
  
    if (nodeState.killed) {
      return res.status(500).send("killed node");
    }
  
    if (messageType === "decision") {
      if (!receivedMessages[k]) receivedMessages[k] = [];
      receivedMessages[k].push(x);
  
      if (receivedMessages[k].length >= N - F) {
        const count0 = receivedMessages[k].filter(v => v === 0).length;
        const count1 = receivedMessages[k].filter(v => v === 1).length;
        
        const decidedValue = count0 > N / 2 ? 0 : count1 > N / 2 ? 1 : "?";
  
        for (let i = 0; i < N; i++) {
          fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ k, x: decidedValue, messageType: "final" }),
          });
        }
      }
    } 
    else if (messageType === "final") {
      if (!receivedMessages[k]) receivedMessages[k] = [];
      receivedMessages[k].push(x);
    
      const finals = receivedMessages[k];
      const count0 = finals.filter(v => v === 0).length;
      const count1 = finals.filter(v => v === 1).length;
    
      if ((count0 >= F + 1 || count1 >= F + 1) && (finals.length >= N - F)) {
        nodeState.x = count1 >= F + 1 ? 1 : 0;
        nodeState.decided = true;
        console.log(`Node ${nodeId} décide définitivement : ${nodeState.x}`);
      } else {
        nodeState.x = (count1 + count0) > 0 ? (count1 >= count0 ? 1 : 0) : (Math.random() < 0.5 ? 0 : 1);
        if (nodeState.k !== null) {
          nodeState.k = nodeState.k + 1;
        
          if (nodeState.k <= 10) {
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ k: nodeState.k, x: nodeState.x, messageType: "decision" }),
              });
            }
          }
        }
        
      }
    }
    
  
    return res.status(200).send("received");
  });
  
  

  node.get("/start", async (req, res) => {
    if (isFaulty) {
      nodeState.x = null;
      nodeState.decided = null;
      nodeState.k = null;
      return res.status(500).send("faulty node");
    }
  
    while (!nodesAreReady()) await new Promise((r) => setTimeout(r, 50));
  
    nodeState.k = 1;
    nodeState.decided = false;
    nodeState.x = initialValue;
  
    for (let i = 0; i < N; i++) {
      fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: nodeState.k, x: nodeState.x, messageType: "decision" }),
      });
    }
  
    return res.status(200).send("Consensus lancé.");
  });
  
  
  

  node.get("/getState", (req, res) => {
    return res.status(200).json(nodeState);
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, () => {
    setNodeIsReady(nodeId);
  });

  return server;
}
