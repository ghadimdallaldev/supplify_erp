import { PrismaService } from './prisma.service';
import { TenantContext } from '@supplify/utils';
export declare abstract class TenantAwareRepository {
    protected prisma: PrismaService;
    constructor(prisma: PrismaService);
    protected tenantContext?: TenantContext;
    setTenantContext(context: TenantContext): void;
    protected getClientId(): string;
    protected getUserId(): string;
    protected getRole(): string;
    protected getOrgType(): string;
    protected ensureTenantScope<T extends {
        clientId: string;
    }>(data: Partial<T>): T;
    protected addTenantFilter<T extends {
        clientId: string;
    }>(where?: Partial<T>): Partial<T>;
    protected addTenantData<T extends {
        clientId: string;
    }>(data: Omit<T, 'clientId'>): T;
    protected logAudit(action: string, entity: string, entityId?: string, before?: any, after?: any): Promise<void>;
}
export declare class TenantProductRepository extends TenantAwareRepository {
    findMany(where?: any): Promise<any>;
    findUnique(where: any): Promise<any>;
    create(data: any): Promise<any>;
    update(where: any, data: any): Promise<any>;
    delete(where: any): Promise<any>;
}
export declare class TenantOrderRepository extends TenantAwareRepository {
    findMany(where?: any): Promise<any>;
    findUnique(where: any): Promise<any>;
    create(data: any): Promise<any>;
    update(where: any, data: any): Promise<any>;
    addEvent(orderId: string, eventData: any): Promise<any>;
    addMessage(orderId: string, messageData: any): Promise<any>;
}
export declare class TenantCampaignRepository extends TenantAwareRepository {
    findMany(where?: any): Promise<any>;
    findUnique(where: any): Promise<any>;
    create(data: any): Promise<any>;
    update(where: any, data: any): Promise<any>;
    approve(campaignId: string, approvedBy: string): Promise<any>;
    logImpression(campaignId: string, impressionData: any): Promise<any>;
    logClick(campaignId: string, clickData: any): Promise<any>;
}
export declare class TenantOrganizationRepository extends TenantAwareRepository {
    findMany(where?: any): Promise<any>;
    findUnique(where: any): Promise<any>;
    create(data: any): Promise<any>;
    update(where: any, data: any): Promise<any>;
    addMember(userId: string, role?: string): Promise<any>;
    removeMember(userId: string): Promise<void>;
}
//# sourceMappingURL=tenant-repositories.d.ts.map