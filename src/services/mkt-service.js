import { supabase } from '../supabase/config';

// Mapping fields from UI (headerMkt) to Database (detail_reports)
// UI Field: DB Column
const FIELD_MAPPING = {
    'id': 'id',
    'Tên': 'Tên',
    'Email': 'Email',
    'Ngày': 'Ngày',
    'ca': 'ca',
    'Sản_phẩm': 'Sản_phẩm',
    'Thị_trường': 'Thị_trường',
    'Team': 'Team',
    'CPQC': 'CPQC',
    'Số_Mess_Cmt': 'Số_Mess_Cmt',
    'Số đơn': 'Số đơn',
    'Doanh số': 'Doanh số',
    'Doanh số đi': 'Doanh số đi thực tế',
    'Số đơn hoàn hủy': 'Số đơn hoàn hủy',
    'DS chốt': 'Doanh thu chốt thực tế',
    'DS sau hoàn hủy': 'DS sau hoàn hủy',
    'Doanh số sau ship': 'Doanh số sau ship',
    'Doanh số TC': 'Doanh số TC',
    'KPIs': 'KPIs',
    'TKQC': 'TKQC',
    'id_NS': 'id_NS',
    'CPQC theo TKQC': 'CPQC theo TKQC',
    'Báo cáo theo Page': 'Báo cáo theo Page',
    'Trạng thái': 'Trạng thái',
    'Cảnh báo': 'Cảnh báo'
};

function normalizeDept(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

function isMktDepartment(value) {
    const d = normalizeDept(value);
    return d.includes('mkt') || d.includes('marketing');
}

export const fetchMktEmployees = async () => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*');

        if (error) throw error;

        const names = new Map();
        (data || []).forEach((emp) => {
            const dept =
                emp?.department ??
                emp?.bo_phan ??
                emp?.['Bộ phận'] ??
                emp?.Bộ_phận ??
                '';
            const team = emp?.team ?? '';
            if (!isMktDepartment(dept) && !isMktDepartment(team)) return;

            const name = String(
                emp?.name ??
                    emp?.username ??
                    emp?.full_name ??
                    emp?.['Họ Và Tên'] ??
                    ''
            ).trim();
            if (!name) return;
            const key = name.toLowerCase();
            if (!names.has(key)) {
                names.set(key, {
                    name,
                    email: emp?.email || null,
                    team: emp?.team || null,
                    branch: emp?.branch || emp?.chi_nhanh || '',
                    id_ns: null,
                });
            }
        });

        return Array.from(names.values());
    } catch (error) {
        console.error('Error fetching MKT employees:', error);
        throw error;
    }
};

export const submitMktReport = async (rows) => {
    try {
        const recordsToInsert = rows.map(row => {
            const mappedRecord = {};

            // Generate UUID if not present (handled by DB default usually, but good to have)
            mappedRecord.id = row.id || crypto.randomUUID();

            Object.keys(row.data).forEach(uiKey => {
                const dbKey = FIELD_MAPPING[uiKey];
                let value = row.data[uiKey];

                if (dbKey) {
                    // Clean number fields
                    const numberFields = [
                        'CPQC', 'Số_Mess_Cmt', 'Số đơn', 'Doanh số',
                        'DS sau hoàn hủy', 'Số đơn hoàn hủy', 'Doanh số sau ship',
                        'Doanh số TC', 'KPIs', 'Doanh số đi thực tế',
                        'Doanh thu chốt thực tế', 'CPQC theo TKQC'
                    ];

                    if (numberFields.includes(dbKey) && typeof value === 'string') {
                        value = parseFloat(value.replace(/[^0-9.-]/g, '')) || 0;
                    }

                    mappedRecord[dbKey] = value;
                }
            });

            // Ensure required fields
            if (!mappedRecord['Email']) throw new Error(`Dòng thiếu Email: ${JSON.stringify(row.data)}`);

            return mappedRecord;
        });

        const { data, error } = await supabase
            .from('detail_reports')
            .upsert(recordsToInsert, { onConflict: 'id' })
            .select();

        if (error) throw error;

        return {
            success: true,
            count: data.length,
            data: data
        };

    } catch (error) {
        console.error('Error submitting MKT report:', error);
        return {
            success: false,
            message: error.message
        };
    }
};
