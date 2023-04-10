export declare const useTagsViewStore: import("pinia").StoreDefinition<"tagsView", {
    visitedViews: never[];
}, {}, {
    addVisitedView(view: any): void;
    delVisitedView(view: any): Promise<unknown>;
    delOthersVisitedViews(view: any): Promise<unknown>;
    delAllVisitedViews(): Promise<unknown>;
}>;
