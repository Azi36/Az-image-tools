import { makeAutoObservable } from "mobx";
import { LocaleData } from "./type";

export class GlobalState {
  public lang: string = "zh-CN";
  public locale: LocaleData | null = null;
  public loading: boolean = false;
  constructor() {
    makeAutoObservable(this);
  }
}

export const gstate = new GlobalState();
