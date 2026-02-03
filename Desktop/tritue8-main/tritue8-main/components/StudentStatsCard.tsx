import { Card, Statistic, Row, Col, Spin } from 'antd';
import { ClockCircleOutlined, CheckCircleOutlined, CloseCircleOutlined, BookOutlined } from '@ant-design/icons';
import { useAttendanceStats } from '../hooks/useAttendanceStats';

interface StudentStatsCardProps {
    studentId: string;
}

const StudentStatsCard = ({ studentId }: StudentStatsCardProps) => {
    const { loading, getStudentStats } = useAttendanceStats();

    if (loading) {
        return <Spin />;
    }

    const stats = getStudentStats(studentId);

    return (
        <Card title="Thống kê học tập" size="small">
            <Row gutter={16}>
                <Col span={12}>
                    <Statistic
                        title="Tổng số buổi học"
                        value={stats.totalSessions}
                        prefix={<BookOutlined />}
                    />
                </Col>
                <Col span={12}>
                    <Statistic
                        title="Tổng số giờ học"
                        value={stats.totalHours}
                        suffix="giờ"
                        prefix={<ClockCircleOutlined />}
                    />
                </Col>
                <Col span={12} style={{ marginTop: 16 }}>
                    <Statistic
                        title="Số buổi có mặt"
                        value={stats.presentSessions}
                        valueStyle={{ color: '#3f8600' }}
                        prefix={<CheckCircleOutlined />}
                    />
                </Col>
                <Col span={12} style={{ marginTop: 16 }}>
                    <Statistic
                        title="Số buổi vắng"
                        value={stats.absentSessions}
                        valueStyle={{ color: '#cf1322' }}
                        prefix={<CloseCircleOutlined />}
                    />
                </Col>
            </Row>
        </Card>
    );
};

export default StudentStatsCard;
