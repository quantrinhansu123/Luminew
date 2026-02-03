import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LeadSourcesModule } from './modules/lead-sources/lead-sources.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { LeadsModule } from './modules/leads/leads.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SalesEmployeesModule } from './modules/sales-employees/sales-employees.module';
import { ProductGroupsModule } from './modules/product-groups/product-groups.module';
import { SalesAllocationModule } from './modules/sales-allocation/sales-allocation.module';
import { InteractionLogsModule } from './modules/interaction-logs/interaction-logs.module';
import { DesignOrdersModule } from './modules/design-orders/design-orders.module';
import { DesignTemplatesModule } from './modules/design-templates/design-templates.module';
import { OrdersModule } from './modules/orders/orders.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CustomersModule } from './modules/customers/customers.module';
import { GoogleDriveModule } from './modules/google-drive/google-drive.module';
import { BaoCaoMktModule } from './modules/bao-cao-mkt/bao-cao-mkt.module';
import { KpisModule } from './modules/kpis/kpis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LeadSourcesModule,
    CampaignsModule,
    LeadsModule,
    WebhooksModule,
    SalesEmployeesModule,
    ProductGroupsModule,
    SalesAllocationModule,
    InteractionLogsModule,
    DesignOrdersModule,
    DesignTemplatesModule,
    OrdersModule,
    DashboardModule,
    CustomersModule,
    GoogleDriveModule,
    BaoCaoMktModule,
    KpisModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
