// @flow

import {
  StateTransitionMachine,
  type AppState,
  type GraphWithAdapters,
} from "./state";

import {Graph, NodeAddress} from "../core/graph";
import {Assets} from "../webutil/assets";
import {makeRepoId, type RepoId} from "../core/repoId";
import {type EdgeEvaluator} from "../analysis/pagerank";
import type {WeightedTypes} from "../analysis/weights";
import {defaultWeightsForAdapterSet} from "./weights/weights";
import {StaticAdapterSet, DynamicAdapterSet} from "./adapters/adapterSet";
import type {
  PagerankNodeDecomposition,
  PagerankOptions,
} from "../analysis/pagerank";
import {staticAdapterSet} from "../plugins/demo/appAdapter";

describe("explorer/state", () => {
  function example(startingState: AppState) {
    const stateContainer = {appState: startingState};
    const getState = () => stateContainer.appState;
    const setState = (appState) => {
      stateContainer.appState = appState;
    };
    const loadGraphMock: (
      assets: Assets,
      adapters: StaticAdapterSet,
      repoId: RepoId
    ) => Promise<GraphWithAdapters> = jest.fn();
    const pagerankMock: (
      Graph,
      EdgeEvaluator,
      PagerankOptions
    ) => Promise<PagerankNodeDecomposition> = jest.fn();
    const stm = new StateTransitionMachine(
      getState,
      setState,
      loadGraphMock,
      pagerankMock
    );
    return {getState, stm, loadGraphMock, pagerankMock};
  }
  function readyToLoadGraph(): AppState {
    return {
      type: "READY_TO_LOAD_GRAPH",
      repoId: makeRepoId("foo", "bar"),
      loading: "NOT_LOADING",
    };
  }
  function readyToRunPagerank(): AppState {
    return {
      type: "READY_TO_RUN_PAGERANK",
      repoId: makeRepoId("foo", "bar"),
      loading: "NOT_LOADING",
      graphWithAdapters: graphWithAdapters(),
    };
  }
  function pagerankEvaluated(): AppState {
    return {
      type: "PAGERANK_EVALUATED",
      repoId: makeRepoId("foo", "bar"),
      graphWithAdapters: graphWithAdapters(),
      pagerankNodeDecomposition: pagerankNodeDecomposition(),
      loading: "NOT_LOADING",
    };
  }
  function weightedTypes(): WeightedTypes {
    return defaultWeightsForAdapterSet(staticAdapterSet());
  }
  function graphWithAdapters(): GraphWithAdapters {
    return {
      graph: new Graph(),
      adapters: new DynamicAdapterSet(new StaticAdapterSet([]), []),
    };
  }
  function pagerankNodeDecomposition() {
    return new Map();
  }
  function loading(state: AppState) {
    return state.loading;
  }

  describe("loadGraph", () => {
    it("can only be called when READY_TO_LOAD_GRAPH", async () => {
      const badStates = [readyToRunPagerank(), pagerankEvaluated()];
      for (const b of badStates) {
        const {stm} = example(b);
        await expect(
          stm.loadGraph(new Assets("/my/gateway/"), new StaticAdapterSet([]))
        ).rejects.toThrow("incorrect state");
      }
    });
    it("passes along the adapters and repoId", () => {
      const {stm, loadGraphMock} = example(readyToLoadGraph());
      expect(loadGraphMock).toHaveBeenCalledTimes(0);
      const assets = new Assets("/my/gateway/");
      const adapters = new StaticAdapterSet([]);
      stm.loadGraph(assets, adapters);
      expect(loadGraphMock).toHaveBeenCalledTimes(1);
      expect(loadGraphMock).toHaveBeenCalledWith(
        assets,
        adapters,
        makeRepoId("foo", "bar")
      );
    });
    it("immediately sets loading status", () => {
      const {getState, stm} = example(readyToLoadGraph());
      expect(loading(getState())).toBe("NOT_LOADING");
      stm.loadGraph(new Assets("/my/gateway/"), new StaticAdapterSet([]));
      expect(loading(getState())).toBe("LOADING");
      expect(getState().type).toBe("READY_TO_LOAD_GRAPH");
    });
    it("transitions to READY_TO_RUN_PAGERANK on success", async () => {
      const {getState, stm, loadGraphMock} = example(readyToLoadGraph());
      const gwa = graphWithAdapters();
      loadGraphMock.mockResolvedValue(gwa);
      const succeeded = await stm.loadGraph(
        new Assets("/my/gateway/"),
        new StaticAdapterSet([])
      );
      expect(succeeded).toBe(true);
      const state = getState();
      expect(loading(state)).toBe("NOT_LOADING");
      expect(state.type).toBe("READY_TO_RUN_PAGERANK");
      if (state.type !== "READY_TO_RUN_PAGERANK") {
        throw new Error("Impossible");
      }
      expect(state.graphWithAdapters).toBe(gwa);
    });
    it("sets loading state FAILED on reject", async () => {
      const {getState, stm, loadGraphMock} = example(readyToLoadGraph());
      const error = new Error("Oh no!");
      // $ExpectFlowError
      console.error = jest.fn();
      loadGraphMock.mockRejectedValue(error);
      const succeeded = await stm.loadGraph(
        new Assets("/my/gateway/"),
        new StaticAdapterSet([])
      );
      expect(succeeded).toBe(false);
      const state = getState();
      expect(loading(state)).toBe("FAILED");
      expect(state.type).toBe("READY_TO_LOAD_GRAPH");
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(error);
    });
  });

  describe("runPagerank", () => {
    it("can only be called when READY_TO_RUN_PAGERANK or PAGERANK_EVALUATED", async () => {
      const badState = readyToLoadGraph();
      const {stm} = example(badState);
      await expect(
        stm.runPagerank(weightedTypes(), NodeAddress.empty)
      ).rejects.toThrow("incorrect state");
    });
    it("can be run when READY_TO_RUN_PAGERANK or PAGERANK_EVALUATED", async () => {
      const goodStates = [readyToRunPagerank(), pagerankEvaluated()];
      for (const g of goodStates) {
        const {stm, getState, pagerankMock} = example(g);
        const pnd = pagerankNodeDecomposition();
        pagerankMock.mockResolvedValue(pnd);
        await stm.runPagerank(weightedTypes(), NodeAddress.empty);
        const state = getState();
        if (state.type !== "PAGERANK_EVALUATED") {
          throw new Error("Impossible");
        }
        expect(state.type).toBe("PAGERANK_EVALUATED");
        expect(state.pagerankNodeDecomposition).toBe(pnd);
      }
    });
    it("immediately sets loading status", () => {
      const {getState, stm} = example(readyToRunPagerank());
      expect(loading(getState())).toBe("NOT_LOADING");
      stm.runPagerank(weightedTypes(), NodeAddress.empty);
      expect(loading(getState())).toBe("LOADING");
    });
    it("calls pagerank with the totalScoreNodePrefix option", async () => {
      const {pagerankMock, stm} = example(readyToRunPagerank());
      const foo = NodeAddress.fromParts(["foo"]);
      await stm.runPagerank(weightedTypes(), foo);
      const args = pagerankMock.mock.calls[0];
      expect(args[2].totalScoreNodePrefix).toBe(foo);
    });
    it("sets loading state FAILED on reject", async () => {
      const {getState, stm, pagerankMock} = example(readyToRunPagerank());
      const error = new Error("Oh no!");
      // $ExpectFlowError
      console.error = jest.fn();
      pagerankMock.mockRejectedValue(error);
      await stm.runPagerank(weightedTypes(), NodeAddress.empty);
      const state = getState();
      expect(loading(state)).toBe("FAILED");
      expect(state.type).toBe("READY_TO_RUN_PAGERANK");
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(error);
    });
  });

  describe("loadGraphAndRunPagerank", () => {
    it("when READY_TO_LOAD_GRAPH, loads graph then runs pagerank", async () => {
      const {stm} = example(readyToLoadGraph());
      (stm: any).loadGraph = jest.fn();
      (stm: any).runPagerank = jest.fn();
      stm.loadGraph.mockResolvedValue(true);
      const assets = new Assets("/gateway/");
      const adapters = new StaticAdapterSet([]);
      const prefix = NodeAddress.fromParts(["bar"]);
      const wt = weightedTypes();
      await stm.loadGraphAndRunPagerank(assets, adapters, wt, prefix);
      expect(stm.loadGraph).toHaveBeenCalledTimes(1);
      expect(stm.loadGraph).toHaveBeenCalledWith(assets, adapters);
      expect(stm.runPagerank).toHaveBeenCalledTimes(1);
      expect(stm.runPagerank).toHaveBeenCalledWith(wt, prefix);
    });
    it("does not run pagerank if loadGraph did not succeed", async () => {
      const {stm} = example(readyToLoadGraph());
      (stm: any).loadGraph = jest.fn();
      (stm: any).runPagerank = jest.fn();
      stm.loadGraph.mockResolvedValue(false);
      const assets = new Assets("/gateway/");
      const adapters = new StaticAdapterSet([]);
      const prefix = NodeAddress.fromParts(["bar"]);
      await stm.loadGraphAndRunPagerank(
        assets,
        adapters,
        weightedTypes(),
        prefix
      );
      expect(stm.loadGraph).toHaveBeenCalledTimes(1);
      expect(stm.runPagerank).toHaveBeenCalledTimes(0);
    });
    it("when READY_TO_RUN_PAGERANK, runs pagerank", async () => {
      const {stm} = example(readyToRunPagerank());
      (stm: any).loadGraph = jest.fn();
      (stm: any).runPagerank = jest.fn();
      const prefix = NodeAddress.fromParts(["bar"]);
      const wt = weightedTypes();
      await stm.loadGraphAndRunPagerank(
        new Assets("/gateway/"),
        new StaticAdapterSet([]),
        wt,
        prefix
      );
      expect(stm.loadGraph).toHaveBeenCalledTimes(0);
      expect(stm.runPagerank).toHaveBeenCalledTimes(1);
      expect(stm.runPagerank).toHaveBeenCalledWith(wt, prefix);
    });
    it("when PAGERANK_EVALUATED, runs pagerank", async () => {
      const {stm} = example(pagerankEvaluated());
      (stm: any).loadGraph = jest.fn();
      (stm: any).runPagerank = jest.fn();
      const prefix = NodeAddress.fromParts(["bar"]);
      const wt = weightedTypes();
      await stm.loadGraphAndRunPagerank(
        new Assets("/gateway/"),
        new StaticAdapterSet([]),
        wt,
        prefix
      );
      expect(stm.loadGraph).toHaveBeenCalledTimes(0);
      expect(stm.runPagerank).toHaveBeenCalledTimes(1);
      expect(stm.runPagerank).toHaveBeenCalledWith(wt, prefix);
    });
  });
});
