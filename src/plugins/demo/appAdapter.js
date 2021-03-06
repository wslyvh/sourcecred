// @flow

import type {PluginDeclaration} from "../../analysis/pluginDeclaration";
import {declaration} from "./declaration";
import type {
  StaticAppAdapter,
  DynamicAppAdapter,
} from "../../explorer/adapters/appAdapter";
import {StaticAdapterSet} from "../../explorer/adapters/adapterSet";
import {Assets} from "../../webutil/assets";
import {type RepoId, makeRepoId} from "../../core/repoId";
import {NodeAddress, type NodeAddressT} from "../../core/graph";
import {graph} from "./graph";

export class FactorioStaticAdapter implements StaticAppAdapter {
  loadingMock: (assets: Assets, repoId: RepoId) => Promise<mixed>;
  declaration(): PluginDeclaration {
    return declaration;
  }
  async load(assets: Assets, repoId: RepoId) {
    const result: FactorioDynamicAdapter = new FactorioDynamicAdapter();
    if (this.loadingMock) {
      return this.loadingMock(assets, repoId).then(() => result);
    }
    return Promise.resolve(result);
  }
}

export class FactorioDynamicAdapter implements DynamicAppAdapter {
  graph() {
    return graph();
  }
  nodeDescription(x: NodeAddressT) {
    return `[factorio]: ${NodeAddress.toString(x)}`;
  }
  static(): FactorioStaticAdapter {
    return new FactorioStaticAdapter();
  }
}

export function staticAdapterSet() {
  return new StaticAdapterSet([new FactorioStaticAdapter()]);
}

export async function dynamicAdapterSet() {
  return await staticAdapterSet().load(
    new Assets("/gateway/"),
    makeRepoId("foo", "bar")
  );
}
