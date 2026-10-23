package com.flashq.mapper;

import com.flashq.entity.CustomCategory;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import java.util.Map;

@Mapper
public interface CustomCategoryMapper {

    // 查询用户所有分类（含各分类题目数），默认分类排第一位
    List<Map<String, Object>> findListWithCount(@Param("userId") Integer userId);

    // 按ID查询分类（仅查名称用，不校验归属）
    CustomCategory findById(@Param("id") Integer id);

    // 按ID+userId查询分类
    CustomCategory findByIdAndUserId(@Param("id") Integer id,
                                     @Param("userId") Integer userId);

    // 查询用户的"其他"默认分类
    CustomCategory findDefaultByUserId(@Param("userId") Integer userId);

    // 统计用户自定义分类数量（不含默认分类）
    int countCustomByUserId(@Param("userId") Integer userId);

    // 统计同名分类数（唯一性校验用）
    int countByUserIdAndName(@Param("userId") Integer userId,
                             @Param("name") String name);

    // 插入分类
    void insert(CustomCategory category);

    // 更新分类名称
    int updateName(@Param("id") Integer id,
                   @Param("userId") Integer userId,
                   @Param("name") String name);

    // 删除分类
    int deleteByIdAndUserId(@Param("id") Integer id,
                            @Param("userId") Integer userId);
}
