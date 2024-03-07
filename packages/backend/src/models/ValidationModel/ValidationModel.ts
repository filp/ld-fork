import {
    ChartKind,
    type CreateValidation,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    NotFoundError,
    type ValidationErrorChartResponse,
    type ValidationErrorDashboardResponse,
    type ValidationErrorTableResponse,
    type ValidationResponse,
    type ValidationResponseBase,
    ValidationSourceType,
} from '@lightdash/common';
import { type Knex } from 'knex';
import {
    AnalyticsChartViewsTableName,
    AnalyticsDashboardViewsTableName,
} from '../../database/entities/analytics';
import {
    DashboardsTableName,
    type DashboardTable,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import {
    SavedChartsTableName,
    type SavedChartTable,
} from '../../database/entities/savedCharts';
import { type DbSpace, SpaceTableName } from '../../database/entities/spaces';
import { type UserTable, UserTableName } from '../../database/entities/users';
import {
    type DbValidationTable,
    ValidationTableName,
} from '../../database/entities/validation';

type ValidationModelArguments = {
    database: Knex;
};

export class ValidationModel {
    private database: Knex;

    constructor(args: ValidationModelArguments) {
        this.database = args.database;
    }

    async create(
        validations: CreateValidation[],
        jobId?: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const insertPromises = validations.map((validation) =>
                trx(ValidationTableName).insert({
                    project_uuid: validation.projectUuid,
                    error: validation.error,
                    job_id: jobId ?? null,
                    error_type: validation.errorType,
                    source: validation.source ?? null,
                    ...(isTableValidationError(validation) && {
                        model_name: validation.modelName,
                    }),
                    ...(isChartValidationError(validation) && {
                        saved_chart_uuid: validation.chartUuid,
                        field_name: validation.fieldName,
                        chart_name: validation.chartName ?? null,
                    }),
                    ...(isDashboardValidationError(validation) && {
                        dashboard_uuid: validation.dashboardUuid,
                        field_name: validation.fieldName ?? null,
                        chart_name: validation.chartName ?? null,
                        model_name: validation.name,
                    }),
                }),
            );

            await Promise.all(insertPromises);
        });
    }

    async delete(projectUuid: string): Promise<void> {
        await this.database(ValidationTableName)
            .where({ project_uuid: projectUuid })
            .delete();
    }

    async getByValidationId(
        validationId: number,
    ): Promise<Pick<ValidationResponseBase, 'validationId' | 'projectUuid'>> {
        const [validation] = await this.database(ValidationTableName).where(
            'validation_id',
            validationId,
        );

        if (!validation) {
            throw new NotFoundError(
                `Validation with id ${validationId} not found`,
            );
        }

        return {
            validationId: validation.validation_id,
            projectUuid: validation.project_uuid,
        };
    }

    async deleteValidation(validationId: number): Promise<void> {
        await this.database(ValidationTableName)
            .where('validation_id', validationId)
            .delete();
    }

    async get(
        projectUuid: string,
        jobId?: string,
    ): Promise<ValidationResponse[]> {
        const chartValidationErrorsRows = await this.database(
            ValidationTableName,
        )
            .leftJoin(
                SavedChartsTableName,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${ValidationTableName}.saved_chart_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${SavedChartsTableName}.space_id`,
            )

            .leftJoin(
                UserTableName,
                `${SavedChartsTableName}.last_version_updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .andWhere((queryBuilder) => {
                if (jobId) {
                    queryBuilder.where('job_id', jobId);
                } else {
                    queryBuilder.whereNull('job_id');
                }
            })
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Chart,
            )
            .select<
                (DbValidationTable &
                    Pick<
                        SavedChartTable['base'],
                        | 'name'
                        | 'last_version_updated_at'
                        | 'last_version_chart_kind'
                    > &
                    Pick<UserTable['base'], 'first_name' | 'last_name'> &
                    Pick<DbSpace, 'space_uuid'> & {
                        last_updated_at: Date;
                        views: string;
                    })[]
            >([
                `${ValidationTableName}.*`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.last_version_updated_at`,
                `${SavedChartsTableName}.last_version_chart_kind`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsChartViewsTableName}.chart_uuid') FROM ${AnalyticsChartViewsTableName} WHERE saved_queries.saved_query_uuid = ${AnalyticsChartViewsTableName}.chart_uuid) as views`,
                ),
            ])
            .orderBy([
                {
                    column: `${SavedChartsTableName}.name`,
                    order: 'asc',
                },
                {
                    column: `${SavedChartsTableName}.saved_query_id`,
                    order: 'desc',
                },
                {
                    column: `${ValidationTableName}.error`,
                    order: 'asc',
                },
            ])
            .distinctOn([
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.saved_query_id`,
                `${ValidationTableName}.error`,
            ]);

        const chartValidationErrors: ValidationErrorChartResponse[] =
            chartValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                chartUuid: validationError.saved_chart_uuid!,
                chartViews: parseInt(validationError.views, 10) || 0,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name:
                    validationError.name ||
                    validationError.chart_name ||
                    'Chart does not exist',
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_version_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
                chartType:
                    validationError.last_version_chart_kind ||
                    ChartKind.VERTICAL_BAR,
                errorType: validationError.error_type,
                fieldName: validationError.field_name ?? undefined,
                source: ValidationSourceType.Chart,
            }));

        const dashboardValidationErrorsRows: (DbValidationTable &
            Pick<DashboardTable['base'], 'name'> &
            Pick<UserTable['base'], 'first_name' | 'last_name'> &
            Pick<DbSpace, 'space_uuid'> & {
                last_updated_at: Date;
                views: string;
            })[] = await this.database(ValidationTableName)
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${ValidationTableName}.dashboard_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                `${DashboardVersionsTableName}`,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .where('project_uuid', projectUuid)
            .andWhere((queryBuilder) => {
                if (jobId) {
                    queryBuilder.where('job_id', jobId);
                } else {
                    queryBuilder.whereNull('job_id');
                }
            })
            .andWhere(
                `${ValidationTableName}.source`,
                ValidationSourceType.Dashboard,
            )
            .select([
                `${ValidationTableName}.*`,
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.created_at as last_updated_at`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${SpaceTableName}.space_uuid`,
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsDashboardViewsTableName}.dashboard_uuid') FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid) as views`,
                ),
            ])
            .orderBy([
                {
                    column: `${DashboardsTableName}.name`,
                    order: 'asc',
                },
                {
                    column: `${DashboardVersionsTableName}.dashboard_id`,
                    order: 'desc',
                },
                {
                    column: `${ValidationTableName}.error`,
                    order: 'asc',
                },
            ])
            .distinctOn([
                `${DashboardsTableName}.name`,
                `${DashboardVersionsTableName}.dashboard_id`,
                `${ValidationTableName}.error`,
            ]);

        const dashboardValidationErrors: ValidationErrorDashboardResponse[] =
            dashboardValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                dashboardUuid: validationError.dashboard_uuid!,
                dashboardViews: parseInt(validationError.views, 10) || 0,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name:
                    validationError.name ||
                    validationError.model_name ||
                    'Dashboard does not exist',
                lastUpdatedBy: validationError.first_name
                    ? `${validationError.first_name} ${validationError.last_name}`
                    : undefined,
                lastUpdatedAt: validationError.last_updated_at,
                validationId: validationError.validation_id,
                spaceUuid: validationError.space_uuid,
                errorType: validationError.error_type,
                fieldName: validationError.field_name ?? undefined,
                chartName: validationError.chart_name ?? undefined,
                source: ValidationSourceType.Dashboard,
            }));

        const tableValidationErrorsRows: DbValidationTable[] =
            await this.database(ValidationTableName)
                .select(`${ValidationTableName}.*`)
                .where('project_uuid', projectUuid)
                .andWhere((queryBuilder) => {
                    if (jobId) {
                        queryBuilder.where('job_id', jobId);
                    } else {
                        queryBuilder.whereNull('job_id');
                    }
                })
                .andWhere(
                    `${ValidationTableName}.source`,
                    ValidationSourceType.Table,
                )
                .distinctOn(`${ValidationTableName}.error`);

        const tableValidationErrors: ValidationErrorTableResponse[] =
            tableValidationErrorsRows.map((validationError) => ({
                createdAt: validationError.created_at,
                projectUuid: validationError.project_uuid,
                error: validationError.error,
                name: validationError.model_name ?? undefined,
                validationId: validationError.validation_id,
                errorType: validationError.error_type,
                source: ValidationSourceType.Table,
            }));

        return [
            ...tableValidationErrors,
            ...chartValidationErrors,
            ...dashboardValidationErrors,
        ];
    }
}
